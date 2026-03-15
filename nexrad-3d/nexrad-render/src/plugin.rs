use bevy::{asset::embedded_asset, light::GlobalAmbientLight, prelude::*};
use nexrad_core::{sites::RadarSite, types::{ElevationScan, RadarVolume}};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use bevy::picking::prelude::Pointer;
use bevy::picking::events::Click;

use crate::{
    basemap::BasemapPlugin,
    camera::orbit_camera::{CameraMode, CameraSystemSet, OrbitCamera, OrbitCameraPlugin, PendingZoomAtPoint},
    overlay::{radar_sites::RadarSitesPlugin, OverlayLayerId, SiteClickNotifier},
    rendering::{
        elevation_mesh::build_elevation_mesh,
        radar_material::RadarMaterial,
        radar_texture::create_reflectivity_texture,
    },
};

// ── Tagged volume ─────────────────────────────────────────────────────────────

/// A `RadarVolume` tagged with the React layer that owns it.
pub struct TaggedVolume {
    pub layer_id: String,
    pub volume: RadarVolume,
}

// ── Public resources ─────────────────────────────────────────────────────────

/// Send radar volumes into the Bevy scene.
#[derive(Resource, Clone)]
pub struct RadarVolumeSender(pub async_channel::Sender<TaggedVolume>);

/// Tracks whether radar data has finished loading.
#[derive(Resource, Default)]
pub struct LoadStatus {
    pub radar_loaded: bool,
}

// ── Internal resources / components ──────────────────────────────────────────

#[derive(Resource)]
pub(crate) struct RadarDataChannel(pub(crate) async_channel::Receiver<TaggedVolume>);

/// When set (e.g. by nexrad-web), a system drains this receiver and forwards
/// each volume to `RadarVolumeSender`.
#[derive(Resource)]
pub struct ExternalVolumeReceiver(pub async_channel::Receiver<TaggedVolume>);

// ── JS ↔ Bevy IPC ─────────────────────────────────────────────────────────────

/// One alert polygon payload (coordinates in GeoJSON [lng, lat] order).
#[derive(Debug, Clone, Deserialize)]
pub struct AlertPolygonData {
    pub id: String,
    pub coordinates: Vec<[f64; 2]>,
    pub color: [f32; 4],
}

/// Commands forwarded from the main JS command channel to the AlertsPlugin.
#[derive(Debug, Clone)]
pub enum AlertCommand {
    SetAlerts { layer_id: String, alerts: Vec<AlertPolygonData> },
    ClearAlerts { layer_id: String },
}

#[derive(Resource)]
pub struct AlertCommandSender(pub async_channel::Sender<AlertCommand>);

#[derive(Resource)]
pub struct AlertCommandReceiver(pub async_channel::Receiver<AlertCommand>);

#[derive(Debug, Clone)]
pub enum JsCommand {
    ResetCamera,
    /// Despawn all entities for a layer and remove its state.
    RemoveLayer { layer_id: String },
    /// Set how many elevation tilts are shown for a specific radar layer.
    SetElevationCount { layer_id: String, count: u32 },
    /// Set the minimum dBZ threshold for a specific radar layer.
    SetThreshold { layer_id: String, dbz: f32 },
    /// Set the render range cap (km) for a specific radar layer.
    SetRangeKm { layer_id: String, range_km: f32 },
    SetCameraMode(CameraMode),
    /// Replace alert polygons for an alerts layer.
    SetAlerts { layer_id: String, alerts: Vec<AlertPolygonData> },
    /// Remove all alert polygons for an alerts layer.
    ClearAlerts { layer_id: String },
    /// Show or hide overlay layer entities (e.g. radar-sites).
    SetLayerVisible { layer_id: String, visible: bool },
    /// Zoom toward a specific viewport point (from JS pinch or pointer gestures).
    /// `delta` > 0 = zoom in; same sign convention as scroll delta.
    /// `x`, `y` are logical CSS pixels matching Bevy's cursor_position() space.
    ZoomAtPoint { x: f32, y: f32, delta: f32 },
}

impl JsCommand {
    pub fn from_json(json: &str) -> Option<Self> {
        let v: serde_json::Value = serde_json::from_str(json).ok()?;
        match v["type"].as_str()? {
            "ResetCamera" => Some(JsCommand::ResetCamera),
            "RemoveLayer" => {
                let layer_id = v["layer_id"].as_str()?.to_string();
                Some(JsCommand::RemoveLayer { layer_id })
            }
            "SetElevationCount" => {
                let layer_id = v["layer_id"].as_str().unwrap_or("radar-1").to_string();
                let count = v["count"].as_u64()? as u32;
                Some(JsCommand::SetElevationCount { layer_id, count })
            }
            "SetThreshold" => {
                let layer_id = v["layer_id"].as_str().unwrap_or("radar-1").to_string();
                let dbz = v["dbz"].as_f64()? as f32;
                Some(JsCommand::SetThreshold { layer_id, dbz })
            }
            "SetRangeKm" => {
                let layer_id = v["layer_id"].as_str().unwrap_or("radar-1").to_string();
                let range_km = v["range_km"].as_f64()? as f32;
                Some(JsCommand::SetRangeKm { layer_id, range_km })
            }
            "SetCameraMode" => {
                let cam_mode = match v["mode"].as_str().unwrap_or("2d") {
                    "3d" => CameraMode::Tilt3D,
                    _ => CameraMode::Pan2D,
                };
                Some(JsCommand::SetCameraMode(cam_mode))
            }
            "SetAlerts" => {
                let layer_id = v["layer_id"].as_str()?.to_string();
                let alerts: Vec<AlertPolygonData> = serde_json::from_value(v["alerts"].clone()).ok()?;
                Some(JsCommand::SetAlerts { layer_id, alerts })
            }
            "ClearAlerts" => {
                let layer_id = v["layer_id"].as_str()?.to_string();
                Some(JsCommand::ClearAlerts { layer_id })
            }
            "SetLayerVisible" => {
                let layer_id = v["layer_id"].as_str()?.to_string();
                let visible = v["visible"].as_bool().unwrap_or(true);
                Some(JsCommand::SetLayerVisible { layer_id, visible })
            }
            "ZoomAtPoint" => {
                let x = v["x"].as_f64()? as f32;
                let y = v["y"].as_f64()? as f32;
                let delta = v["delta"].as_f64()? as f32;
                Some(JsCommand::ZoomAtPoint { x, y, delta })
            }
            _ => None,
        }
    }
}

#[derive(Resource)]
pub struct JsCommandReceiver(pub async_channel::Receiver<JsCommand>);

// ── Per-layer state ───────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct RadarLayerState {
    pub elevation_count: u32,
    pub elevation_total: u32,
    pub threshold_dbz: f32,
    /// Render range cap in km. Fade begins at 75% of this value.
    pub range_km: f32,
    pub site_world_pos: Vec3,
    pub base_dims: BaseTextureDims,
    pub site_id: Option<String>,
}

impl Default for RadarLayerState {
    fn default() -> Self {
        Self {
            elevation_count: 0,
            elevation_total: 0,
            threshold_dbz: 0.0,
            range_km: 460.0,
            site_world_pos: Vec3::ZERO,
            base_dims: BaseTextureDims::default(),
            site_id: None,
        }
    }
}

impl RadarLayerState {
    fn new(threshold_dbz: f32) -> Self {
        Self { threshold_dbz, ..default() }
    }
}

#[derive(Resource, Default)]
pub struct RadarLayerStates(pub HashMap<String, RadarLayerState>);

// ── UiState ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Default)]
pub struct UiRadarLayerState {
    pub layer_id: String,
    pub site: Option<String>,
    pub elevation_count: u32,
    pub elevation_total: u32,
    pub threshold_dbz: f32,
    pub range_km: f32,
}

#[derive(Serialize, Clone, Default)]
pub struct UiState {
    pub radar_loaded: bool,
    // Backwards-compat fields — mirror the primary (first) radar layer.
    pub active_site: Option<String>,
    pub elevation_count: u32,
    pub elevation_total: u32,
    pub threshold_dbz: f32,
    pub radar_layers: Vec<UiRadarLayerState>,
}

impl UiState {
    fn sync_layers(&mut self, layer_states: &RadarLayerStates) {
        self.radar_layers = layer_states.0.iter().map(|(id, s)| UiRadarLayerState {
            layer_id: id.clone(),
            site: s.site_id.clone(),
            elevation_count: s.elevation_count,
            elevation_total: s.elevation_total,
            threshold_dbz: s.threshold_dbz,
            range_km: s.range_km,
        }).collect();
        self.radar_layers.sort_by(|a, b| a.layer_id.cmp(&b.layer_id));

        if let Some(primary) = layer_states.0.get("radar-1")
            .or_else(|| layer_states.0.values().next())
        {
            self.active_site = primary.site_id.clone();
            self.elevation_count = primary.elevation_count;
            self.elevation_total = primary.elevation_total;
            self.threshold_dbz = primary.threshold_dbz;
        }
    }
}

#[derive(Resource, Default)]
pub struct StateNotifier(pub Option<Box<dyn Fn(&UiState) + Send + Sync>>);

impl StateNotifier {
    pub fn notify(&self, state: &UiState) {
        if let Some(f) = &self.0 {
            f(state);
        }
    }
}

#[derive(Resource, Default)]
pub(crate) struct UiStateResource(pub UiState);

const WORLD_ORIGIN_LAT: f64 = 36.0;
const WORLD_ORIGIN_LNG: f64 = -98.0;

// ── Entity components ─────────────────────────────────────────────────────────

#[derive(Component)]
pub struct RadarElevation;

#[derive(Component, Clone)]
pub struct LayerId(pub String);

#[derive(Component)]
pub struct ElevationIndex(pub u32);

#[derive(Component)]
pub struct BaseElevationMarker;

// ── Animation frame types ──────────────────────────────────────────────────

pub struct AnimationFrame {
    pub num_rays: usize,
    pub num_gates: usize,
    pub data: Vec<u8>,
}

#[derive(Resource, Clone)]
pub struct AnimationFrameSlots(
    pub Arc<RwLock<HashMap<String, Arc<RwLock<Option<AnimationFrame>>>>>>,
);

impl Default for AnimationFrameSlots {
    fn default() -> Self {
        Self(Arc::new(RwLock::new(HashMap::new())))
    }
}

impl AnimationFrameSlots {
    pub fn slot_for(&self, layer_id: &str) -> Arc<RwLock<Option<AnimationFrame>>> {
        let mut map = self.0.write().expect("AnimationFrameSlots poisoned");
        map.entry(layer_id.to_string())
            .or_insert_with(|| Arc::new(RwLock::new(None)))
            .clone()
    }
}

#[derive(Clone, Default)]
pub struct BaseTextureDims {
    pub num_rays: usize,
    pub num_gates: usize,
}

// ── Plugin ────────────────────────────────────────────────────────────────────

pub struct RadarPlugin;

impl Default for RadarPlugin {
    fn default() -> Self {
        Self
    }
}

impl Plugin for RadarPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "rendering/shaders/radar_elevation.wgsl");

        let (radar_tx, radar_rx) = async_channel::unbounded::<TaggedVolume>();

        app.insert_resource(RadarVolumeSender(radar_tx.clone()))
            .insert_resource(RadarDataChannel(radar_rx));

        if let Some(ext) = app.world_mut().remove_resource::<ExternalVolumeReceiver>() {
            app.add_systems(Update, forward_external_volume.before(receive_radar_data))
               .insert_resource(ext);
        }

        if app.world().get_resource::<JsCommandReceiver>().is_some() {
            app.add_systems(Update, drain_js_commands.before(CameraSystemSet::OrbitCamera));
        }

        if app.world().get_resource::<AnimationFrameSlots>().is_some() {
            app.add_systems(Update, receive_animation_frames);
        }

        app.init_resource::<LoadStatus>()
            .init_resource::<StateNotifier>()
            .init_resource::<SiteClickNotifier>()
            .init_resource::<UiStateResource>()
            .init_resource::<RadarLayerStates>()
            .add_plugins(BasemapPlugin)
            .add_plugins(OrbitCameraPlugin)
            .add_plugins(MaterialPlugin::<RadarMaterial>::default())
            .add_plugins(RadarSitesPlugin)
            .add_systems(Startup, setup_scene_lighting)
            .add_systems(Update, receive_radar_data)
            .add_observer(|trigger: On<Pointer<Click>>| {
                log::info!("global Pointer<Click> on entity {:?}", trigger.entity);
            });
    }
}

// ── Startup ───────────────────────────────────────────────────────────────────

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

// ── Systems ───────────────────────────────────────────────────────────────────

fn forward_external_volume(ext: Res<ExternalVolumeReceiver>, sender: Res<RadarVolumeSender>) {
    while let Ok(tagged) = ext.0.try_recv() {
        let _ = sender.0.try_send(tagged);
    }
}

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
    layer_state: &RadarLayerState,
    layer_id: &str,
    site_offset: Vec3,
) {
    let bounds = slab_bounds(scans);
    for (i, (scan, (lower, upper))) in scans.iter().zip(bounds.iter()).enumerate() {
        let mesh = build_elevation_mesh(scan, *lower, *upper);
        let texture = create_reflectivity_texture(images, scan);
        let material = materials.add(RadarMaterial {
            reflectivity_texture: texture,
            params: Vec4::new(
                layer_state.threshold_dbz,
                layer_state.range_km,
                site_offset.x,
                site_offset.z,
            ),
        });
        let visible = (i as u32) < layer_state.elevation_count;
        let mut entity = commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::from_translation(site_offset),
            if visible { Visibility::Visible } else { Visibility::Hidden },
            RadarElevation,
            LayerId(layer_id.to_string()),
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
    old_elevations: Query<(Entity, &LayerId), With<RadarElevation>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut status: ResMut<LoadStatus>,
    notifier: Res<StateNotifier>,
    mut ui_state: ResMut<UiStateResource>,
    mut camera: Query<&mut OrbitCamera>,
    mut layer_states: ResMut<RadarLayerStates>,
) {
    let Ok(tagged) = channel.0.try_recv() else { return };
    let TaggedVolume { layer_id, volume } = tagged;

    for (entity, lid) in &old_elevations {
        if lid.0 == layer_id {
            commands.entity(entity).despawn();
        }
    }

    let offset = if let Some(site) = RadarSite::lookup(&volume.site) {
        let (x, _, z) = nexrad_core::geo::wgs84_to_bevy(
            site.lat, site.lng, WORLD_ORIGIN_LAT, WORLD_ORIGIN_LNG,
        );
        Vec3::new(x, 0.0, z)
    } else {
        Vec3::ZERO
    };

    if layer_id == "radar-1" {
        if let Ok(mut cam) = camera.single_mut() {
            cam.focus = offset;
        }
    }

    let mut scans = volume.elevations;
    scans.sort_by(|a, b| {
        a.elevation_angle
            .partial_cmp(&b.elevation_angle)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let layer_state = layer_states.0
        .entry(layer_id.clone())
        .or_insert_with(|| RadarLayerState::new(10.0));
    layer_state.elevation_total = scans.len() as u32;
    layer_state.elevation_count = 1.min(scans.len() as u32);
    layer_state.site_world_pos = offset;
    layer_state.site_id = Some(volume.site.clone());
    let layer_state_snapshot = layer_state.clone();

    spawn_elevation_entities(
        &mut commands,
        &mut meshes,
        &mut materials,
        &mut images,
        &scans,
        &layer_state_snapshot,
        &layer_id,
        offset,
    );

    log::info!("loaded {} elevation sweeps from {} (layer: {})", scans.len(), volume.site, layer_id);
    status.radar_loaded = true;
    ui_state.0.radar_loaded = true;
    ui_state.0.sync_layers(&layer_states);
    notifier.notify(&ui_state.0);
}

fn drain_js_commands(
    mut commands: Commands,
    receiver: Res<JsCommandReceiver>,
    alert_tx: Option<Res<AlertCommandSender>>,
    mut camera: Query<&mut OrbitCamera>,
    elevations: Query<(Entity, &LayerId), With<RadarElevation>>,
    mut sweeps: Query<(&mut Visibility, &ElevationIndex, &LayerId), With<RadarElevation>>,
    mut overlay_visibility: Query<(&OverlayLayerId, &mut Visibility), Without<RadarElevation>>,
    notifier: Res<StateNotifier>,
    mut ui_state: ResMut<UiStateResource>,
    mut layer_states: ResMut<RadarLayerStates>,
    elev_material_handles: Query<(&MeshMaterial3d<RadarMaterial>, &LayerId), With<RadarElevation>>,
    mut radar_materials: ResMut<Assets<RadarMaterial>>,
    mut camera_mode: ResMut<CameraMode>,
    mut pending_zoom: ResMut<PendingZoomAtPoint>,
) {
    while let Ok(cmd) = receiver.0.try_recv() {
        match cmd {
            JsCommand::SetAlerts { layer_id, alerts } => {
                if let Some(tx) = &alert_tx {
                    let _ = tx.0.try_send(AlertCommand::SetAlerts { layer_id, alerts });
                }
            }
            JsCommand::ClearAlerts { layer_id } => {
                if let Some(tx) = &alert_tx {
                    let _ = tx.0.try_send(AlertCommand::ClearAlerts { layer_id });
                }
            }
            JsCommand::RemoveLayer { layer_id } => {
                for (entity, lid) in &elevations {
                    if lid.0 == layer_id {
                        commands.entity(entity).despawn();
                    }
                }
                layer_states.0.remove(&layer_id);
                ui_state.0.sync_layers(&layer_states);
                notifier.notify(&ui_state.0);
            }
            JsCommand::SetElevationCount { layer_id, count } => {
                if let Some(s) = layer_states.0.get_mut(&layer_id) {
                    s.elevation_count = count.min(s.elevation_total);
                    let capped = s.elevation_count;
                    for (mut v, idx, lid) in sweeps.iter_mut() {
                        if lid.0 == layer_id {
                            *v = if idx.0 < capped { Visibility::Visible } else { Visibility::Hidden };
                        }
                    }
                }
                ui_state.0.sync_layers(&layer_states);
                notifier.notify(&ui_state.0);
            }
            JsCommand::SetThreshold { layer_id, dbz } => {
                if let Some(s) = layer_states.0.get_mut(&layer_id) {
                    s.threshold_dbz = dbz;
                }
                for (handle, lid) in &elev_material_handles {
                    if lid.0 == layer_id {
                        if let Some(mat) = radar_materials.get_mut(&handle.0) {
                            mat.params.x = dbz;
                        }
                    }
                }
                ui_state.0.sync_layers(&layer_states);
                notifier.notify(&ui_state.0);
            }
            JsCommand::SetRangeKm { layer_id, range_km } => {
                if let Some(s) = layer_states.0.get_mut(&layer_id) {
                    s.range_km = range_km;
                }
                for (handle, lid) in &elev_material_handles {
                    if lid.0 == layer_id {
                        if let Some(mat) = radar_materials.get_mut(&handle.0) {
                            mat.params.y = range_km;
                        }
                    }
                }
                ui_state.0.sync_layers(&layer_states);
                notifier.notify(&ui_state.0);
            }
            JsCommand::ResetCamera => {
                if let Ok(mut cam) = camera.single_mut() {
                    let focus = cam.focus;
                    *cam = OrbitCamera::default();
                    cam.focus = focus;
                }
            }
            JsCommand::SetCameraMode(new_mode) => {
                *camera_mode = new_mode;
            }
            JsCommand::SetLayerVisible { layer_id, visible } => {
                for (lid, mut vis) in &mut overlay_visibility {
                    if lid.0 == layer_id {
                        *vis = if visible { Visibility::Visible } else { Visibility::Hidden };
                    }
                }
            }
            JsCommand::ZoomAtPoint { x, y, delta } => {
                // Overwrite: only the latest pinch command per frame is applied
                pending_zoom.0 = Some((delta, Vec2::new(x, y)));
            }
        }
    }
}

fn receive_animation_frames(
    slots: Res<AnimationFrameSlots>,
    base_query: Query<(&LayerId, &MeshMaterial3d<RadarMaterial>), With<BaseElevationMarker>>,
    mut radar_materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut layer_states: ResMut<RadarLayerStates>,
) {
    let slots_map = match slots.0.read() {
        Ok(m) => m,
        Err(_) => return,
    };

    for (layer_id, mat_handle) in &base_query {
        let Some(slot) = slots_map.get(&layer_id.0) else { continue };
        let frame = {
            let mut g = match slot.write() { Ok(g) => g, Err(_) => continue };
            g.take()
        };
        let Some(frame) = frame else { continue };

        let Some(mat) = radar_materials.get_mut(&mat_handle.0) else { continue };
        let tex_handle = &mat.reflectivity_texture;

        let dims = layer_states.0
            .entry(layer_id.0.clone())
            .or_insert_with(|| RadarLayerState::new(10.0));

        if frame.num_rays == dims.base_dims.num_rays && frame.num_gates == dims.base_dims.num_gates {
            if let Some(image) = images.get_mut(tex_handle) {
                image.data = Some(frame.data);
            }
        } else {
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
            if let Some(mat) = radar_materials.get_mut(&mat_handle.0) {
                mat.reflectivity_texture = new_handle;
            }
            dims.base_dims.num_rays = frame.num_rays;
            dims.base_dims.num_gates = frame.num_gates;
        }
    }
}
