use bevy::{asset::embedded_asset, light::GlobalAmbientLight, prelude::*};
use nexrad_core::{isosurface::IsoMeshData, types::{ElevationScan, RadarVolume}};

use crate::{
    camera::orbit_camera::OrbitCameraPlugin,
    rendering::{
        elevation_mesh::build_elevation_mesh,
        isosurface_mesh::into_bevy_mesh,
        radar_material::{IsoSurfaceMaterial, RadarMaterial},
        radar_texture::create_reflectivity_texture,
    },
};

// ── Public resources ─────────────────────────────────────────────────────────

/// Send radar volumes into the Bevy scene. Obtained from the world after
/// `RadarPlugin` has been added. Both the CLI fetch thread and the web
/// `spawn_local` closure clone this and call `try_send`.
#[derive(Resource, Clone)]
pub struct RadarVolumeSender(pub async_channel::Sender<RadarVolume>);

/// Tracks whether each layer of data has finished loading.
/// Read by the CLI screenshot system to know when to capture.
#[derive(Resource, Default)]
pub struct LoadStatus {
    pub radar_loaded: bool,
    pub iso_loaded: bool,
}

// ── Internal resources / components ──────────────────────────────────────────

#[derive(Resource)]
pub(crate) struct RadarDataChannel(pub(crate) async_channel::Receiver<RadarVolume>);

#[derive(Resource)]
pub struct IsoSurfaceChannel {
    pub(crate) tx: async_channel::Sender<Vec<IsoMeshData>>,
    pub(crate) rx: async_channel::Receiver<Vec<IsoMeshData>>,
}

/// Marks entities that are part of the current radar sweep volume.
#[derive(Component)]
pub struct RadarElevation;

/// Marks entities that belong to the derived isosurface rendering mode.
#[derive(Component)]
pub struct RadarIsoSurface;

// ── Render mode ───────────────────────────────────────────────────────────────

#[derive(Resource, Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    Sweeps,
    IsoSurface,
    Combined,
}

impl Default for RenderMode {
    fn default() -> Self {
        Self::Sweeps
    }
}

impl RenderMode {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "isosurface" => RenderMode::IsoSurface,
            "combined" => RenderMode::Combined,
            _ => RenderMode::Sweeps,
        }
    }

    pub fn next(self) -> Self {
        match self {
            RenderMode::Sweeps => RenderMode::IsoSurface,
            RenderMode::IsoSurface => RenderMode::Combined,
            RenderMode::Combined => RenderMode::Sweeps,
        }
    }

    pub fn shows_sweeps(self) -> bool {
        matches!(self, RenderMode::Sweeps | RenderMode::Combined)
    }

    pub fn shows_isosurface(self) -> bool {
        matches!(self, RenderMode::IsoSurface | RenderMode::Combined)
    }

    pub fn label(self) -> &'static str {
        match self {
            RenderMode::Sweeps => "sweeps",
            RenderMode::IsoSurface => "isosurface",
            RenderMode::Combined => "combined",
        }
    }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

/// Core radar rendering plugin. Add to your `App` before `DefaultPlugins`.
///
/// Exposes `RadarVolumeSender` as a resource so each entrypoint (CLI thread,
/// WASM `spawn_local`) can feed parsed volumes into the scene.
pub struct RadarPlugin {
    pub initial_mode: RenderMode,
}

impl Default for RadarPlugin {
    fn default() -> Self {
        Self { initial_mode: RenderMode::Sweeps }
    }
}

impl Plugin for RadarPlugin {
    fn build(&self, app: &mut App) {
        // Embed WGSL shaders at compile time so they work on WASM without
        // any filesystem/HTTP asset loading.
        embedded_asset!(app, "rendering/shaders/radar_elevation.wgsl");
        embedded_asset!(app, "rendering/shaders/isosurface.wgsl");

        let (radar_tx, radar_rx) = async_channel::unbounded::<RadarVolume>();
        let (iso_tx, iso_rx) = async_channel::unbounded::<Vec<IsoMeshData>>();

        app.insert_resource(RadarVolumeSender(radar_tx))
            .insert_resource(RadarDataChannel(radar_rx))
            .insert_resource(IsoSurfaceChannel { tx: iso_tx, rx: iso_rx })
            .insert_resource(self.initial_mode)
            .init_resource::<LoadStatus>()
            .add_plugins(OrbitCameraPlugin)
            .add_plugins(MaterialPlugin::<RadarMaterial>::default())
            .add_plugins(MaterialPlugin::<IsoSurfaceMaterial>::default())
            .add_systems(Startup, setup_scene_lighting)
            .add_systems(
                Update,
                (receive_radar_data, receive_isosurface_data, toggle_render_mode),
            );
    }
}

// ── Startup systems ───────────────────────────────────────────────────────────

fn setup_scene_lighting(
    mut commands: Commands,
    mut global_ambient: ResMut<GlobalAmbientLight>,
) {
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

// ── Per-frame systems ─────────────────────────────────────────────────────────

/// Compute (lower_elev, upper_elev) slab bounds for each scan in a sorted
/// elevation list. Adjacent slabs share the same boundary height so the
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
    mut status: ResMut<LoadStatus>,
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

    kick_off_isosurface(iso_channel.tx.clone(), scans.clone());

    log::info!("loaded {} elevation sweeps from {}", scans.len(), volume.site);
    status.radar_loaded = true;
}

/// Spawn the isosurface computation off the Bevy main thread on native,
/// or run it synchronously on WASM (acceptable until GPU pipeline replaces it).
fn kick_off_isosurface(
    tx: async_channel::Sender<Vec<IsoMeshData>>,
    scans: Vec<ElevationScan>,
) {
    #[cfg(not(target_arch = "wasm32"))]
    std::thread::spawn(move || {
        let surfaces = nexrad_core::isosurface::build_threshold_surfaces(&scans);
        if !surfaces.is_empty() {
            let _ = tx.try_send(surfaces);
        }
    });

    #[cfg(target_arch = "wasm32")]
    {
        let surfaces = nexrad_core::isosurface::build_threshold_surfaces(&scans);
        if !surfaces.is_empty() {
            let _ = tx.try_send(surfaces);
        }
    }
}

fn receive_isosurface_data(
    mut commands: Commands,
    iso_channel: Res<IsoSurfaceChannel>,
    old_iso: Query<Entity, With<RadarIsoSurface>>,
    mode: Res<RenderMode>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut iso_materials: ResMut<Assets<IsoSurfaceMaterial>>,
    mut status: ResMut<LoadStatus>,
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
        let mesh = into_bevy_mesh(mesh_data);
        let material = iso_materials.add(IsoSurfaceMaterial {});
        commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::default(),
            iso_visibility,
            RadarIsoSurface,
        ));
    }

    log::info!("derived isosurface meshes generated");
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

    log::info!(
        "render mode: {} (press V to cycle sweeps → isosurface → combined)",
        mode.label()
    );
}
