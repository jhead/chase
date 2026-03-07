mod camera;
mod nexrad;
mod rendering;

use bevy::{app::AppExit, camera::Viewport, light::GlobalAmbientLight, prelude::*, render::view::screenshot::{save_to_disk, Screenshot}, window::PrimaryWindow};
use camera::{orbit_camera::OrbitCamera, OrbitCameraPlugin};
use clap::Parser;
use nexrad::types::{ElevationScan, RadarVolume};
use rendering::{
    elevation_mesh::build_elevation_mesh,
    isosurface::IsoMeshData,
    radar_material::{IsoSurfaceMaterial, RadarMaterial},
    radar_texture::create_reflectivity_texture,
};

#[derive(Parser, Resource, Debug, Clone)]
#[command(author, version, about, long_about = None)]
struct CliArgs {
    /// Radar site to load (e.g., KHTX)
    #[arg(short, long, default_value = "KHTX")]
    site: String,

    /// Render mode (sweeps, isosurface, or combined)
    #[arg(short, long, default_value = "sweeps")]
    mode: String,

    /// Output file path for the screenshot
    #[arg(short, long)]
    output: Option<String>,
}

/// Identifies which 2×2 quadrant a camera occupies (0=TL, 1=TR, 2=BL, 3=BR).
/// A system reads the physical window size each frame and sets the viewport accordingly.
#[derive(Component)]
struct QuadrantCamera(usize);

/// Marks entities that are part of the current radar volume so they can be
/// despawned wholesale when new data arrives.
#[derive(Component)]
struct RadarElevation;

/// Marks entities that belong to the derived isosurface rendering mode.
#[derive(Component)]
struct RadarIsoSurface;

/// Channel through which the background fetch thread delivers a parsed
/// `RadarVolume` to the Bevy main thread.
#[derive(Resource)]
struct RadarDataChannel(async_channel::Receiver<RadarVolume>);

/// Channel used by worker threads to send derived isosurface mesh data.
/// Sends all threshold surfaces in one batch (outermost to innermost).
#[derive(Resource)]
struct IsoSurfaceChannel {
    tx: async_channel::Sender<Vec<IsoMeshData>>,
    rx: async_channel::Receiver<Vec<IsoMeshData>>,
}

#[derive(Resource, Debug, Clone, Copy, PartialEq, Eq)]
enum RenderMode {
    Sweeps,
    IsoSurface,
    Combined,
}

impl RenderMode {
    fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "isosurface" => RenderMode::IsoSurface,
            "combined" => RenderMode::Combined,
            _ => RenderMode::Sweeps,
        }
    }

    fn next(self) -> Self {
        match self {
            RenderMode::Sweeps => RenderMode::IsoSurface,
            RenderMode::IsoSurface => RenderMode::Combined,
            RenderMode::Combined => RenderMode::Sweeps,
        }
    }

    fn shows_sweeps(self) -> bool {
        matches!(self, RenderMode::Sweeps | RenderMode::Combined)
    }

    fn shows_isosurface(self) -> bool {
        matches!(self, RenderMode::IsoSurface | RenderMode::Combined)
    }

    fn label(self) -> &'static str {
        match self {
            RenderMode::Sweeps => "sweeps",
            RenderMode::IsoSurface => "isosurface",
            RenderMode::Combined => "combined",
        }
    }
}

#[derive(Resource, Default)]
struct DataStatus {
    radar_loaded: bool,
    iso_loaded: bool,
    screenshot_taken: bool,
    frames_since_ready: u32,
    exit_requested: bool,
}

/// Each frame, recompute every QuadrantCamera's viewport from the actual
/// physical window size so the split is correct on HiDPI / Retina displays.
fn update_quadrant_viewports(
    windows: Query<&Window, With<PrimaryWindow>>,
    mut cameras: Query<(&QuadrantCamera, &mut Camera)>,
) {
    let Ok(window) = windows.single() else { return };
    let phys_w = window.physical_width();
    let phys_h = window.physical_height();
    if phys_w == 0 || phys_h == 0 {
        return;
    }
    let half_w = phys_w / 2;
    let half_h = phys_h / 2;
    for (quadrant, mut camera) in &mut cameras {
        let pos = match quadrant.0 {
            0 => UVec2::new(0,      0),
            1 => UVec2::new(half_w, 0),
            2 => UVec2::new(0,      half_h),
            _ => UVec2::new(half_w, half_h),
        };
        camera.viewport = Some(Viewport {
            physical_position: pos,
            physical_size: UVec2::new(half_w, half_h),
            ..default()
        });
    }
}

fn main() {
    let args = CliArgs::parse();
    let initial_mode = RenderMode::from_str(&args.mode);
    let is_headless = args.output.is_some();

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "NEXRAD 3D Radar".into(),
                resolution: (1400_u32, 900_u32).into(),
                visible: !is_headless,
                ..default()
            }),
            ..default()
        }))
        .add_plugins(MaterialPlugin::<RadarMaterial>::default())
        .add_plugins(MaterialPlugin::<IsoSurfaceMaterial>::default())
        .add_plugins(OrbitCameraPlugin)
        .insert_resource(args)
        .insert_resource(initial_mode)
        .init_resource::<DataStatus>()
        .add_systems(Startup, (setup, start_radar_fetch))
        .add_systems(
            Update,
            (
                update_quadrant_viewports,
                receive_radar_data,
                receive_isosurface_data,
                toggle_render_mode,
                screenshot_and_exit,
            ),
        )
        .run();
}

/// Compute (lower_elev, upper_elev) slab bounds for each scan in a sorted
/// elevation list.  Adjacent slabs share the same boundary height so the
/// full volume is seamlessly contiguous with no gaps.
fn slab_bounds(scans: &[ElevationScan]) -> Vec<(f32, f32)> {
    let n = scans.len();
    (0..n)
        .map(|i| {
            let lower = if i == 0 {
                0.0_f32
            } else {
                (scans[i - 1].elevation_angle + scans[i].elevation_angle) / 2.0
            };
            let upper = if i + 1 < n {
                (scans[i].elevation_angle + scans[i + 1].elevation_angle) / 2.0
            } else {
                // Extrapolate the same gap above the topmost tilt.
                let gap = if n >= 2 {
                    scans[i].elevation_angle - scans[i - 1].elevation_angle
                } else {
                    2.0
                };
                scans[i].elevation_angle + gap
            };
            (lower, upper)
        })
        .collect()
}

/// Spawn a set of `RadarElevation` mesh entities from a sorted slice of scans.
fn spawn_elevation_entities(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<RadarMaterial>,
    images: &mut Assets<Image>,
    scans: &[ElevationScan],
    visibility: Visibility,
) {
    let bounds = slab_bounds(scans);
    for (scan, (lower, upper)) in scans.iter().zip(bounds.iter()) {
        let mesh = build_elevation_mesh(scan, *lower, *upper);
        let texture = create_reflectivity_texture(images, scan);
        let material = materials.add(RadarMaterial {
            reflectivity_texture: texture,
        });
        commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::default(),
            visibility,
            RadarElevation,
        ));
    }
}

fn setup(
    mut commands: Commands,
    mut global_ambient: ResMut<GlobalAmbientLight>,
    args: Res<CliArgs>,
) {
    let (iso_tx, iso_rx) = async_channel::unbounded::<Vec<IsoMeshData>>();
    commands.insert_resource(IsoSurfaceChannel {
        tx: iso_tx,
        rx: iso_rx,
    });

    if args.output.is_some() {
        // Screenshot mode: 4 static camera angles in a 2×2 grid.
        // Viewports are set at runtime (see update_quadrant_viewports) so physical
        // pixel coordinates are correct on both 1× and HiDPI/Retina displays.
        let views: [(f32, f32); 4] = [
            (0.3,                                   1.1), // TL: NE perspective
            (0.0, std::f32::consts::FRAC_PI_2 - 0.01), // TR: top-down
            (std::f32::consts::PI,                  0.8), // BL: south side
            (std::f32::consts::FRAC_PI_2,           0.6), // BR: east side
        ];
        for (i, (yaw, pitch)) in views.iter().enumerate() {
            let orbit = OrbitCamera { focus: Vec3::ZERO, radius: 400_000.0, yaw: *yaw, pitch: *pitch };
            let transform = orbit.to_transform();
            let camera = Camera { order: i as isize, ..default() };
            if i == 0 {
                commands.spawn((Camera3d::default(), camera, transform, orbit, QuadrantCamera(i)));
            } else {
                commands.spawn((Camera3d::default(), camera, transform, QuadrantCamera(i)));
            }
        }
    } else {
        // Interactive mode: single orbit camera (original behaviour).
        let orbit = OrbitCamera::default();
        let transform = orbit.to_transform();
        commands.spawn((Camera3d::default(), transform, orbit));
    }

    // Directional light for isosurface shading — angled from upper-left.
    commands.spawn((
        DirectionalLight {
            illuminance: 8_000.0,
            shadows_enabled: false,
            ..default()
        },
        Transform::default().looking_at(Vec3::new(0.4, -0.8, 0.3), Vec3::Y),
    ));

    global_ambient.brightness = 1000.0;
}

/// Spawn a background thread that runs a tokio runtime, fetches the latest
/// radar volume via the CF Worker proxy, parses it, and sends the result on
/// the channel.
fn start_radar_fetch(mut commands: Commands, args: Res<CliArgs>) {
    let (tx, rx) = async_channel::unbounded::<RadarVolume>();
    commands.insert_resource(RadarDataChannel(rx));

    let site = args.site.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        rt.block_on(async move {
            match nexrad::client::fetch_latest_volume(&site).await {
                Ok(volume) => {
                    let _ = tx.try_send(volume);
                }
                Err(e) => warn!("radar fetch failed: {e}"),
            }
        });
    });
}

/// Each frame: check whether the background thread has delivered a new volume.
/// When it has, despawn all placeholder / previous elevation entities and spawn
/// fresh ones from the real data.
fn receive_radar_data(
    mut commands: Commands,
    channel: Res<RadarDataChannel>,
    old_elevations: Query<Entity, With<RadarElevation>>,
    old_iso: Query<Entity, With<RadarIsoSurface>>,
    iso_channel: Res<IsoSurfaceChannel>,
    mode: Res<RenderMode>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut status: ResMut<DataStatus>,
) {
    let Ok(volume) = channel.0.try_recv() else {
        return;
    };

    for entity in &old_elevations {
        commands.entity(entity).despawn();
    }
    for entity in &old_iso {
        commands.entity(entity).despawn();
    }

    let mut scans = volume.elevations;
    scans.sort_by(|a, b| {
        a.elevation_angle
            .partial_cmp(&b.elevation_angle)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    spawn_elevation_entities(
        &mut commands,
        &mut meshes,
        &mut materials,
        &mut images,
        &scans,
        if mode.shows_sweeps() {
            Visibility::Visible
        } else {
            Visibility::Hidden
        },
    );

    // Kick off derived isosurface generation in the background.
    let tx = iso_channel.tx.clone();
    let scans_for_iso = scans.clone();
    std::thread::spawn(move || {
        let surfaces = rendering::isosurface::build_threshold_surfaces(&scans_for_iso);
        if !surfaces.is_empty() {
            let _ = tx.try_send(surfaces);
        }
    });

    info!(
        "loaded {} elevation sweeps from {}",
        scans.len(),
        volume.site
    );
    status.radar_loaded = true;
}

fn receive_isosurface_data(
    mut commands: Commands,
    iso_channel: Res<IsoSurfaceChannel>,
    old_iso: Query<Entity, With<RadarIsoSurface>>,
    mode: Res<RenderMode>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut iso_materials: ResMut<Assets<IsoSurfaceMaterial>>,
    mut status: ResMut<DataStatus>,
) {
    let Ok(surfaces) = iso_channel.rx.try_recv() else {
        return;
    };

    for entity in &old_iso {
        commands.entity(entity).despawn();
    }

    let iso_visibility = if mode.shows_isosurface() {
        Visibility::Visible
    } else {
        Visibility::Hidden
    };

    for mesh_data in surfaces {
        let mesh = mesh_data.into_mesh();
        let material = iso_materials.add(IsoSurfaceMaterial {});
        commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::default(),
            iso_visibility,
            RadarIsoSurface,
        ));
    }

    info!("derived isosurface meshes generated");
    status.iso_loaded = true;
}

fn toggle_render_mode(
    keys: Res<ButtonInput<KeyCode>>,
    mut mode: ResMut<RenderMode>,
    mut sweeps: Query<&mut Visibility, (With<RadarElevation>, Without<RadarIsoSurface>)>,
    mut isos: Query<&mut Visibility, (With<RadarIsoSurface>, Without<RadarElevation>)>,
) {
    if !keys.just_pressed(KeyCode::KeyV) {
        return;
    }

    *mode = mode.next();

    let sweeps_visible = mode.shows_sweeps();
    let isos_visible = mode.shows_isosurface();

    for mut visibility in &mut sweeps {
        *visibility = if sweeps_visible {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for mut visibility in &mut isos {
        *visibility = if isos_visible {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }

    info!(
        "render mode: {} (press V to cycle sweeps → isosurface → combined)",
        mode.label()
    );
}

fn screenshot_and_exit(
    mut commands: Commands,
    args: Res<CliArgs>,
    mode: Res<RenderMode>,
    mut status: ResMut<DataStatus>,
    mut app_exit: MessageWriter<AppExit>,
    main_window: Query<Entity, With<PrimaryWindow>>,
) {
    let Some(output_path) = args.output.clone() else {
        return;
    };

    if status.exit_requested {
        return;
    }

    if status.screenshot_taken {
        // Once the screenshot is triggered, we wait a few more frames for it to be saved
        // before exiting the application.
        status.frames_since_ready += 1;
        if status.frames_since_ready > 20 {
            app_exit.write(AppExit::Success);
            status.exit_requested = true;
        }
        return;
    }

    let ready = match *mode {
        RenderMode::Sweeps => status.radar_loaded,
        RenderMode::IsoSurface => status.iso_loaded,
        RenderMode::Combined => status.radar_loaded && status.iso_loaded,
    };

    if ready {
        status.frames_since_ready += 1;
        // Wait longer (e.g., 60 frames) to ensure GPU has finished rendering 
        // and the window is fully initialized.
        if status.frames_since_ready > 60 {
            if let Ok(window_entity) = main_window.single() {
                status.screenshot_taken = true;
                status.frames_since_ready = 0; // reset counter for exit delay
                commands
                    .spawn(Screenshot::window(window_entity))
                    .observe(save_to_disk(output_path.clone()));
                info!("Taking screenshot to {}", output_path);
            }
        }
    }
}
