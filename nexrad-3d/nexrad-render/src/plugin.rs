use bevy::{asset::embedded_asset, light::GlobalAmbientLight, prelude::*};
use nexrad_core::{sites::RadarSite, types::{ElevationScan, RadarVolume}};
use serde::Serialize;
use std::sync::{Arc, RwLock};

use crate::{
    basemap::BasemapPlugin,
    camera::orbit_camera::{CameraMode, OrbitCamera, OrbitCameraPlugin},
    rendering::{
        elevation_mesh::build_elevation_mesh,
        radar_material::RadarMaterial,
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
}

// ── Internal resources / components ──────────────────────────────────────────

#[derive(Resource)]
pub(crate) struct RadarDataChannel(pub(crate) async_channel::Receiver<RadarVolume>);

/// When set (e.g. by nexrad-web), a system drains this receiver and forwards
/// each volume to `RadarVolumeSender`. Allows JS to push volumes without Rust fetch.
#[derive(Resource)]
pub struct ExternalVolumeReceiver(pub async_channel::Receiver<RadarVolume>);

// ── JS ↔ Bevy IPC ─────────────────────────────────────────────────────────────

/// Commands sent from JavaScript into the Bevy scene via `send_command(json)`.
/// Extend this enum to add new JS-controllable actions — no new WASM exports needed.
#[derive(Debug, Clone)]
pub enum JsCommand {
    ResetCamera,
    SetElevationCount(u32),
    SetThreshold(f32),
    SetCameraMode(CameraMode),
}

impl JsCommand {
    pub fn from_json(json: &str) -> Option<Self> {
        let v: serde_json::Value = serde_json::from_str(json).ok()?;
        match v["type"].as_str()? {
            "ResetCamera" => Some(JsCommand::ResetCamera),
            "SetElevationCount" => {
                let count = v["count"].as_u64()? as u32;
                Some(JsCommand::SetElevationCount(count))
            }
            "SetThreshold" => {
                let dbz = v["dbz"].as_f64()? as f32;
                Some(JsCommand::SetThreshold(dbz))
            }
            "SetCameraMode" => {
                let cam_mode = match v["mode"].as_str().unwrap_or("2d") {
                    "3d" => CameraMode::Tilt3D,
                    _ => CameraMode::Pan2D,
                };
                Some(JsCommand::SetCameraMode(cam_mode))
            }
            _ => None,
        }
    }
}

/// Receives `JsCommand`s from nexrad-web's static channel. Inserted by nexrad-web at startup.
#[derive(Resource)]
pub struct JsCommandReceiver(pub async_channel::Receiver<JsCommand>);

/// Serializable snapshot of renderer state, pushed to JS on meaningful changes.
/// Extend this struct to expose more state to the React HUD.
#[derive(Serialize, Clone, Default)]
pub struct UiState {
    pub radar_loaded: bool,
    pub active_site: Option<String>,
    pub elevation_count: u32,
    pub elevation_total: u32,
    pub threshold_dbz: f32,
}

/// Tracks how many elevation sweeps to display (current) and how many are loaded (total).
#[derive(Resource, Default)]
pub struct ElevationCount {
    pub current: u32,
    pub total: u32,
}

/// Minimum dBZ value to render. Fragments below this are discarded in the shader.
#[derive(Resource)]
pub struct ThresholdDbz(pub f32);

impl Default for ThresholdDbz {
    fn default() -> Self {
        Self(10.0)
    }
}

/// Injected by nexrad-web with a closure that serializes `UiState` and calls the
/// registered JS callback. nexrad-render has no js-sys / wasm-bindgen dependency.
#[derive(Resource, Default)]
pub struct StateNotifier(pub Option<Box<dyn Fn(&UiState) + Send + Sync>>);

impl StateNotifier {
    pub fn notify(&self, state: &UiState) {
        if let Some(f) = &self.0 {
            f(state);
        }
    }
}

/// Current UI state mirrored from Bevy resources. Updated and pushed to JS on change.
#[derive(Resource, Default)]
pub(crate) struct UiStateResource(pub UiState);

/// World-space position of the currently loaded radar site.
/// Shared between receive_radar_data and other systems so they place
/// entities at the correct absolute position.
#[derive(Resource, Default)]
pub(crate) struct CurrentSiteWorldPos(pub Vec3);

/// Fixed world origin — must match BasemapConfig default so geography aligns.
const WORLD_ORIGIN_LAT: f64 = 36.0;
const WORLD_ORIGIN_LNG: f64 = -98.0;

/// Marks entities that are part of the current radar sweep volume.
#[derive(Component)]
pub struct RadarElevation;

/// The sorted elevation index of this sweep (0 = lowest tilt).
#[derive(Component)]
pub struct ElevationIndex(pub u32);

/// Marker for the base (tilt 0) elevation entity, used for fast animation texture swaps.
#[derive(Component)]
pub struct BaseElevationMarker;

// ── Animation frame types ──────────────────────────────────────────────────

/// A single animation frame: pre-quantized R8Unorm reflectivity for tilt 0.
pub struct AnimationFrame {
    pub num_rays: usize,
    pub num_gates: usize,
    pub data: Vec<u8>,
}

/// Latest animation frame slot from JS. Replaces channel so rapid scrubbing
/// overwrites with the current frame instead of queuing; Bevy reads once per tick.
#[derive(Resource)]
pub struct AnimationFrameSlot(pub Arc<RwLock<Option<AnimationFrame>>>);

/// Tracks current base texture dimensions to detect when geometry changes.
#[derive(Resource, Default)]
pub struct BaseTextureDims {
    pub num_rays: usize,
    pub num_gates: usize,
}

// ── Plugin ────────────────────────────────────────────────────────────────────

/// Core radar rendering plugin. Add to your `App` before `DefaultPlugins`.
///
/// Exposes `RadarVolumeSender` as a resource so each entrypoint (CLI thread,
/// WASM `spawn_local`) can feed parsed volumes into the scene.
///
/// For WASM, insert `ExternalVolumeReceiver(rx)` before adding this plugin;
/// the plugin will consume it and drain volumes into the scene.
#[derive(Default)]
pub struct RadarPlugin;

impl Plugin for RadarPlugin {
    fn build(&self, app: &mut App) {
        // Embed WGSL shaders at compile time so they work on WASM without
        // any filesystem/HTTP asset loading.
        embedded_asset!(app, "rendering/shaders/radar_elevation.wgsl");

        let (radar_tx, radar_rx) = async_channel::unbounded::<RadarVolume>();

        app.insert_resource(RadarVolumeSender(radar_tx.clone()))
            .insert_resource(RadarDataChannel(radar_rx));

        if let Some(ext) = app.world_mut().remove_resource::<ExternalVolumeReceiver>() {
            app.add_systems(
                Update,
                forward_external_volume.before(receive_radar_data),
            )
            .insert_resource(ext);
        }

        if app.world().get_resource::<JsCommandReceiver>().is_some() {
            app.add_systems(Update, drain_js_commands);
        }

        if app.world().get_resource::<AnimationFrameSlot>().is_some() {
            app.init_resource::<BaseTextureDims>()
                .add_systems(Update, receive_animation_frame);
        }

        app.init_resource::<LoadStatus>()
            .init_resource::<StateNotifier>()
            .init_resource::<UiStateResource>()
            .init_resource::<CurrentSiteWorldPos>()
            .init_resource::<ElevationCount>()
            .init_resource::<ThresholdDbz>()
            .add_plugins(BasemapPlugin)
            .add_plugins(OrbitCameraPlugin)
            .add_plugins(MaterialPlugin::<RadarMaterial>::default())
            .add_systems(Startup, setup_scene_lighting)
            .add_systems(Update, receive_radar_data);
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

/// When using external volume receiver (WASM), drain it and forward to the internal channel.
fn forward_external_volume(
    ext: Res<ExternalVolumeReceiver>,
    sender: Res<RadarVolumeSender>,
) {
    while let Ok(volume) = ext.0.try_recv() {
        let _ = sender.0.try_send(volume);
    }
}

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
    elev_count: &ElevationCount,
    threshold: &ThresholdDbz,
    site_offset: Vec3,
) {
    let bounds = slab_bounds(scans);
    for (i, (scan, (lower, upper))) in scans.iter().zip(bounds.iter()).enumerate() {
        let mesh = build_elevation_mesh(scan, *lower, *upper);
        let texture = create_reflectivity_texture(images, scan);
        let material = materials.add(RadarMaterial {
            reflectivity_texture: texture,
            params: Vec4::new(threshold.0, 0.0, 0.0, 0.0),
        });
        let visible = (i as u32) < elev_count.current;
        let mut entity = commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::from_translation(site_offset),
            if visible { Visibility::Visible } else { Visibility::Hidden },
            RadarElevation,
            ElevationIndex(i as u32),
        ));
        if i == 0 {
            entity.insert(BaseElevationMarker);
        }
    }
}

fn receive_radar_data(
    mut commands: Commands,
    channel: Res<RadarDataChannel>,
    old_elevations: Query<Entity, With<RadarElevation>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut status: ResMut<LoadStatus>,
    notifier: Res<StateNotifier>,
    mut ui_state: ResMut<UiStateResource>,
    mut site_world_pos: ResMut<CurrentSiteWorldPos>,
    mut camera: Query<&mut OrbitCamera>,
    mut elev_count: ResMut<ElevationCount>,
    threshold: Res<ThresholdDbz>,
) {
    let Ok(volume) = channel.0.try_recv() else {
        return;
    };

    for entity in &old_elevations {
        commands.entity(entity).despawn();
    }

    // Compute absolute world position of this radar site and move camera to it.
    let offset = if let Some(site) = RadarSite::lookup(&volume.site) {
        let (x, _, z) = nexrad_core::geo::wgs84_to_bevy(
            site.lat, site.lng, WORLD_ORIGIN_LAT, WORLD_ORIGIN_LNG,
        );
        Vec3::new(x, 0.0, z)
    } else {
        Vec3::ZERO
    };
    site_world_pos.0 = offset;
    if let Ok(mut cam) = camera.single_mut() {
        cam.focus = offset;
    }

    let mut scans = volume.elevations;
    scans.sort_by(|a, b| {
        a.elevation_angle
            .partial_cmp(&b.elevation_angle)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    elev_count.total = scans.len() as u32;
    // Default to showing 1 tilt; user can increase via slider
    elev_count.current = 1.min(scans.len() as u32);

    spawn_elevation_entities(
        &mut commands,
        &mut meshes,
        &mut materials,
        &mut images,
        &scans,
        &elev_count,
        &threshold,
        offset,
    );

    log::info!("loaded {} elevation sweeps from {}", scans.len(), volume.site);
    status.radar_loaded = true;
    ui_state.0.radar_loaded = true;
    ui_state.0.active_site = Some(volume.site.clone());
    ui_state.0.elevation_count = elev_count.current;
    ui_state.0.elevation_total = elev_count.total;
    ui_state.0.threshold_dbz = threshold.0;
    notifier.notify(&ui_state.0);
}

fn drain_js_commands(
    receiver: Res<JsCommandReceiver>,
    mut camera: Query<&mut OrbitCamera>,
    mut sweeps: Query<(&mut Visibility, &ElevationIndex), With<RadarElevation>>,
    notifier: Res<StateNotifier>,
    mut ui_state: ResMut<UiStateResource>,
    mut elev_count: ResMut<ElevationCount>,
    mut threshold: ResMut<ThresholdDbz>,
    elev_material_handles: Query<&MeshMaterial3d<RadarMaterial>, With<RadarElevation>>,
    mut radar_materials: ResMut<Assets<RadarMaterial>>,
    mut camera_mode: ResMut<CameraMode>,
) {
    while let Ok(cmd) = receiver.0.try_recv() {
        match cmd {
            JsCommand::SetElevationCount(count) => {
                elev_count.current = count.min(elev_count.total);
                for (mut v, idx) in sweeps.iter_mut() {
                    *v = if idx.0 < elev_count.current {
                        Visibility::Visible
                    } else {
                        Visibility::Hidden
                    };
                }
                ui_state.0.elevation_count = elev_count.current;
                ui_state.0.elevation_total = elev_count.total;
                notifier.notify(&ui_state.0);
            }
            JsCommand::SetThreshold(dbz) => {
                threshold.0 = dbz;
                for handle in &elev_material_handles {
                    if let Some(mat) = radar_materials.get_mut(&handle.0) {
                        mat.params.x = dbz;
                    }
                }
                ui_state.0.threshold_dbz = dbz;
                notifier.notify(&ui_state.0);
            }
            JsCommand::ResetCamera => {
                if let Ok(mut cam) = camera.single_mut() {
                    let focus = cam.focus; // keep current site focus
                    *cam = OrbitCamera::default();
                    cam.focus = focus;
                }
            }
            JsCommand::SetCameraMode(new_mode) => {
                *camera_mode = new_mode;
            }
        }
    }
}

fn receive_animation_frame(
    slot: Res<AnimationFrameSlot>,
    base_query: Query<&MeshMaterial3d<RadarMaterial>, With<BaseElevationMarker>>,
    mut radar_materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut dims: ResMut<BaseTextureDims>,
) {
    let frame = {
        let mut g = match slot.0.write() {
            Ok(g) => g,
            Err(_) => return,
        };
        g.take()
    };
    let Some(frame) = frame else {
        return;
    };

    let Ok(mat_handle) = base_query.single() else {
        return;
    };

    let Some(mat) = radar_materials.get_mut(&mat_handle.0) else {
        return;
    };

    let tex_handle = &mat.reflectivity_texture;

    if frame.num_rays == dims.num_rays && frame.num_gates == dims.num_gates {
        // Fast path: overwrite image data in-place (GPU re-upload next frame)
        if let Some(image) = images.get_mut(tex_handle) {
            image.data = Some(frame.data);
        }
    } else {
        // Slow path: dimensions changed, create a new Image
        use bevy::{
            asset::RenderAssetUsages,
            image::{ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
            render::render_resource::{Extent3d, TextureDimension, TextureFormat},
        };

        let mut image = Image::new(
            Extent3d {
                width: frame.num_gates as u32,
                height: frame.num_rays as u32,
                depth_or_array_layers: 1,
            },
            TextureDimension::D2,
            frame.data,
            TextureFormat::R8Unorm,
            RenderAssetUsages::RENDER_WORLD,
        );
        image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
            mag_filter: ImageFilterMode::Nearest,
            min_filter: ImageFilterMode::Nearest,
            ..default()
        });

        let new_handle = images.add(image);
        // Update material to point to new texture
        if let Some(mat) = radar_materials.get_mut(&mat_handle.0) {
            mat.reflectivity_texture = new_handle;
        }

        dims.num_rays = frame.num_rays;
        dims.num_gates = frame.num_gates;
    }
}

