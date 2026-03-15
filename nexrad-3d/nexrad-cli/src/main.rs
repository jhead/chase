use bevy::{
    app::AppExit,
    camera::Viewport,
    prelude::*,
    render::view::screenshot::{save_to_disk, Screenshot},
    window::PrimaryWindow,
};
use clap::Parser;
use nexrad_core::sites::RadarSite;
use nexrad_render::{
    camera::orbit_camera::OrbitCamera,
    BasemapConfig, LoadStatus, RadarPlugin, RadarVolumeSender,
};

#[derive(Parser, Resource, Debug, Clone)]
#[command(author, version, about, long_about = None)]
struct CliArgs {
    /// Radar site to load (e.g., KHTX)
    #[arg(short, long, default_value = "KHTX")]
    site: String,

    /// Output file path for the screenshot
    #[arg(short, long)]
    output: Option<String>,
}

/// Identifies which 2×2 quadrant a camera occupies (0=TL, 1=TR, 2=BL, 3=BR).
/// A system reads the physical window size each frame and sets the viewport accordingly.
#[derive(Component)]
struct QuadrantCamera(usize);

#[derive(Resource, Default)]
struct ScreenshotState {
    taken: bool,
    frames_since_ready: u32,
    exit_requested: bool,
}

fn main() {
    let args = CliArgs::parse();
    let is_headless = args.output.is_some();

    // Set the basemap origin to the selected radar site's coordinates.
    let basemap_config = RadarSite::lookup(&args.site)
        .map(|site| BasemapConfig {
            origin_lat: site.lat,
            origin_lng: site.lng,
            cull_radius_m: 4_500_000.0,
        })
        .unwrap_or_default();

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
        .add_plugins(RadarPlugin)
        .insert_resource(basemap_config)
        .insert_resource(args)
        .init_resource::<ScreenshotState>()
        .add_systems(Startup, (setup_cameras, start_radar_fetch))
        .add_systems(
            Update,
            (update_quadrant_viewports, screenshot_and_exit),
        )
        .run();
}

/// In screenshot mode, replace the plugin's single camera with four quadrant cameras.
/// In normal mode, OrbitCameraPlugin::spawn_camera already handles it.
fn setup_cameras(
    mut commands: Commands,
    args: Res<CliArgs>,
    existing: Query<Entity, With<Camera3d>>,
) {
    if args.output.is_none() {
        return;
    }

    // Despawn the plugin's default camera before adding quadrant cameras.
    for entity in &existing {
        commands.entity(entity).despawn();
    }

    let views: [(f32, f32); 4] = [
        (0.3,                                   1.1),
        (0.0, std::f32::consts::FRAC_PI_2 - 0.01),
        (std::f32::consts::PI,                  0.8),
        (std::f32::consts::FRAC_PI_2,           0.6),
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

/// Spawn a background thread that runs a tokio runtime, fetches the latest
/// radar volume via the CF Worker proxy, parses it, and delivers the result
/// via `RadarVolumeSender` (provided by `RadarPlugin`).
fn start_radar_fetch(sender: Res<RadarVolumeSender>, args: Res<CliArgs>) {
    let tx = sender.0.clone();
    let site = args.site.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        rt.block_on(async move {
            match nexrad_fetch::fetch_latest_volume(&site).await {
                Ok(volume) => {
                    let _ = tx.try_send(volume);
                }
                Err(e) => warn!("radar fetch failed: {e}"),
            }
        });
    });
}

fn screenshot_and_exit(
    mut commands: Commands,
    args: Res<CliArgs>,
    status: Res<LoadStatus>,
    mut state: ResMut<ScreenshotState>,
    mut app_exit: MessageWriter<AppExit>,
    main_window: Query<Entity, With<PrimaryWindow>>,
) {
    let Some(output_path) = args.output.clone() else {
        return;
    };

    if state.exit_requested {
        return;
    }

    if state.taken {
        state.frames_since_ready += 1;
        if state.frames_since_ready > 20 {
            app_exit.write(AppExit::Success);
            state.exit_requested = true;
        }
        return;
    }

    if status.radar_loaded {
        state.frames_since_ready += 1;
        if state.frames_since_ready > 60 {
            if let Ok(window_entity) = main_window.single() {
                state.taken = true;
                state.frames_since_ready = 0;
                commands
                    .spawn(Screenshot::window(window_entity))
                    .observe(save_to_disk(output_path.clone()));
                info!("Taking screenshot to {}", output_path);
            }
        }
    }
}
