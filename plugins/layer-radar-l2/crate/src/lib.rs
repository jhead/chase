pub mod commands;
pub mod radar_material;
pub mod radar_texture;
pub mod elevation_mesh;
pub mod state;

use bevy::{asset::embedded_asset, prelude::*};
use radish_core::types::ElevationScan;
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use radish_render::camera::orbit_camera::OrbitCamera;
use radish_render::{OverlayLayerId, PluginEvent, RawCommand};
use layer_radar_sites::SiteRegistry;
use crate::{
    commands::RadarL2Command,
    elevation_mesh::build_elevation_mesh,
    radar_material::RadarMaterial,
    radar_texture::create_reflectivity_texture,
    state::{RadarLayerState, RadarLayerStates, UiStateResource},
};

const WORLD_ORIGIN_LAT: f64 = 36.0;
const WORLD_ORIGIN_LNG: f64 = -98.0;

// ── Radar moment enum ─────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RadarMoment {
    #[default]
    Reflectivity,
    Velocity,
    SpectrumWidth,
    DifferentialReflectivity,
    CorrelationCoefficient,
    DifferentialPhase,
}

impl RadarMoment {
    pub fn index(&self) -> u32 {
        match self {
            RadarMoment::Reflectivity => 0,
            RadarMoment::Velocity => 1,
            RadarMoment::SpectrumWidth => 2,
            RadarMoment::DifferentialReflectivity => 3,
            RadarMoment::CorrelationCoefficient => 4,
            RadarMoment::DifferentialPhase => 5,
        }
    }
}

// ── Tagged volume ─────────────────────────────────────────────────────────────

/// A `RadarVolume` tagged with the React layer that owns it.
pub struct TaggedVolume {
    pub layer_id: String,
    pub volume: radish_core::types::RadarVolume,
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

/// When set (e.g. by radish-web), a system drains this receiver and forwards
/// each volume to `RadarVolumeSender`.
#[derive(Resource)]
pub struct ExternalVolumeReceiver(pub async_channel::Receiver<TaggedVolume>);

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

/// Per-frame data for all available radar moments.
#[derive(Clone)]
pub struct AnimationFrame {
    pub num_rays: usize,
    pub num_gates: usize,
    /// Reflectivity bytes [0, 255]; always present.
    pub reflectivity: Vec<u8>,
    pub velocity: Option<Vec<u8>>,
    pub spectrum_width: Option<Vec<u8>>,
    pub differential_reflectivity: Option<Vec<u8>>,
    pub correlation_coefficient: Option<Vec<u8>>,
    pub differential_phase: Option<Vec<u8>>,
}

impl AnimationFrame {
    /// Return the data slice for the requested moment, falling back to reflectivity.
    pub fn moment_data(&self, moment: &RadarMoment) -> &Vec<u8> {
        match moment {
            RadarMoment::Reflectivity => &self.reflectivity,
            RadarMoment::Velocity => self.velocity.as_ref().unwrap_or(&self.reflectivity),
            RadarMoment::SpectrumWidth => self.spectrum_width.as_ref().unwrap_or(&self.reflectivity),
            RadarMoment::DifferentialReflectivity => self.differential_reflectivity.as_ref().unwrap_or(&self.reflectivity),
            RadarMoment::CorrelationCoefficient => self.correlation_coefficient.as_ref().unwrap_or(&self.reflectivity),
            RadarMoment::DifferentialPhase => self.differential_phase.as_ref().unwrap_or(&self.reflectivity),
        }
    }
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

// ── Plugin ────────────────────────────────────────────────────────────────────

pub struct RadarL2Plugin;

impl Default for RadarL2Plugin {
    fn default() -> Self {
        Self
    }
}

impl Plugin for RadarL2Plugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "shaders/radar_elevation.wgsl");

        let (radar_tx, radar_rx) = async_channel::unbounded::<TaggedVolume>();

        app.insert_resource(RadarVolumeSender(radar_tx.clone()))
            .insert_resource(RadarDataChannel(radar_rx));

        if let Some(ext) = app.world_mut().remove_resource::<ExternalVolumeReceiver>() {
            app.add_systems(Update, forward_external_volume.before(receive_radar_data))
               .insert_resource(ext);
        }

        app.add_systems(Update, drain_radar_commands);

        if app.world().get_resource::<AnimationFrameSlots>().is_some() {
            app.add_systems(Update, receive_animation_frames);
        }

        app.init_resource::<LoadStatus>()
            .init_resource::<UiStateResource>()
            .init_resource::<RadarLayerStates>()
            .add_plugins(MaterialPlugin::<RadarMaterial>::default())
            .add_systems(Update, receive_radar_data);
    }
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
    let moment_idx = layer_state.active_moment.index() as f32;
    for (i, (scan, (lower, upper))) in scans.iter().zip(bounds.iter()).enumerate() {
        let mesh = build_elevation_mesh(scan, *lower, *upper);
        let texture = create_reflectivity_texture(images, scan);
        let material = materials.add(RadarMaterial {
            reflectivity_texture: texture,
            params: Vec4::new(layer_state.threshold_dbz, layer_state.range_km, site_offset.x, site_offset.z),
            moment_params: Vec4::new(moment_idx, 0.0, 0.0, 0.0),
        });
        let visible = (i as u32) < layer_state.elevation_count;
        let mut entity = commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::from_translation(site_offset),
            if visible { Visibility::Visible } else { Visibility::Hidden },
            RadarElevation,
            LayerId(layer_id.to_string()),
            OverlayLayerId(layer_id.to_string()),
            ElevationIndex(i as u32),
        ));
        if i == 0 {
            entity.insert(BaseElevationMarker);
        }
    }
}

fn notify_state(writer: &mut MessageWriter<PluginEvent>, ui_state: &state::UiState) {
    if let Ok(json) = serde_json::to_string(ui_state) {
        writer.write(PluginEvent {
            name: "state_update".into(),
            data: json,
        });
    }
}

/// Build an `AnimationFrame` from an `ElevationScan` (converts f32 normalized → u8).
pub fn scan_to_frame(scan: &ElevationScan) -> AnimationFrame {
    fn to_u8(data: &[f32]) -> Vec<u8> {
        data.iter().map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8).collect()
    }
    fn to_u8_opt(opt: &Option<Vec<f32>>) -> Option<Vec<u8>> {
        opt.as_ref().map(|d| to_u8(d))
    }
    AnimationFrame {
        num_rays: scan.num_rays,
        num_gates: scan.num_gates,
        reflectivity: to_u8(&scan.reflectivity),
        velocity: to_u8_opt(&scan.velocity),
        spectrum_width: to_u8_opt(&scan.spectrum_width),
        differential_reflectivity: to_u8_opt(&scan.differential_reflectivity),
        correlation_coefficient: to_u8_opt(&scan.correlation_coefficient),
        differential_phase: to_u8_opt(&scan.differential_phase),
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
    mut events: MessageWriter<PluginEvent>,
    mut ui_state: ResMut<UiStateResource>,
    mut camera: Query<&mut OrbitCamera>,
    mut layer_states: ResMut<RadarLayerStates>,
    site_registry: Res<SiteRegistry>,
) {
    let Ok(tagged) = channel.0.try_recv() else { return };
    let TaggedVolume { layer_id, volume } = tagged;

    for (entity, lid) in &old_elevations {
        if lid.0 == layer_id {
            commands.entity(entity).despawn();
        }
    }

    let offset = if let Some((lat, lng)) = site_registry.lookup(&volume.site) {
        let (x, _, z) = radish_core::geo::wgs84_to_bevy(
            lat, lng, WORLD_ORIGIN_LAT, WORLD_ORIGIN_LNG,
        );
        Vec3::new(x, 0.0, z)
    } else {
        log::warn!("radar-l2: site '{}' not found in SiteRegistry", volume.site);
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

    // Build animation frame from base scan and compute available moments.
    if !scans.is_empty() {
        let frame = scan_to_frame(&scans[0]);
        layer_state.available_moments = {
            let mut m = vec!["reflectivity".to_string()];
            if frame.velocity.is_some() { m.push("velocity".to_string()); }
            if frame.spectrum_width.is_some() { m.push("spectrum_width".to_string()); }
            if frame.differential_reflectivity.is_some() { m.push("differential_reflectivity".to_string()); }
            if frame.correlation_coefficient.is_some() { m.push("correlation_coefficient".to_string()); }
            if frame.differential_phase.is_some() { m.push("differential_phase".to_string()); }
            m
        };
        layer_state.base_dims.num_rays = scans[0].num_rays;
        layer_state.base_dims.num_gates = scans[0].num_gates;
        layer_state.last_frame = Some(frame);
    }

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
    notify_state(&mut events, &ui_state.0);
}

fn drain_radar_commands(
    mut commands: Commands,
    mut raw_commands: MessageReader<RawCommand>,
    elevations: Query<(Entity, &LayerId), With<RadarElevation>>,
    mut sweeps: Query<(&mut Visibility, &ElevationIndex, &LayerId), With<RadarElevation>>,
    mut events: MessageWriter<PluginEvent>,
    mut ui_state: ResMut<UiStateResource>,
    mut layer_states: ResMut<RadarLayerStates>,
    elev_material_handles: Query<(&MeshMaterial3d<RadarMaterial>, &LayerId), With<RadarElevation>>,
    base_elevations: Query<(&LayerId, &MeshMaterial3d<RadarMaterial>), With<BaseElevationMarker>>,
    mut radar_materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
) {
    for raw in raw_commands.read() {
        let Some(cmd) = RadarL2Command::from_json(&raw.0) else { continue };
        match cmd {
            RadarL2Command::RemoveLayer { layer_id } => {
                for (entity, lid) in &elevations {
                    if lid.0 == layer_id {
                        commands.entity(entity).despawn();
                    }
                }
                layer_states.0.remove(&layer_id);
                ui_state.0.sync_layers(&layer_states);
                notify_state(&mut events, &ui_state.0);
            }
            RadarL2Command::SetElevationCount { layer_id, count } => {
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
                notify_state(&mut events, &ui_state.0);
            }
            RadarL2Command::SetThreshold { layer_id, dbz } => {
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
                notify_state(&mut events, &ui_state.0);
            }
            RadarL2Command::SetRangeKm { layer_id, range_km } => {
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
                notify_state(&mut events, &ui_state.0);
            }
            RadarL2Command::SetActiveMoment { layer_id, moment } => {
                let moment_idx = moment.index() as f32;

                // Update moment_params on all elevation meshes for this layer.
                for (handle, lid) in &elev_material_handles {
                    if lid.0 == layer_id {
                        if let Some(mat) = radar_materials.get_mut(&handle.0) {
                            mat.moment_params.x = moment_idx;
                        }
                    }
                }

                // Re-apply the last cached frame with the new moment's data.
                if let Some(s) = layer_states.0.get_mut(&layer_id) {
                    s.active_moment = moment.clone();
                    if let Some(frame) = s.last_frame.clone() {
                        let data = frame.moment_data(&moment).clone();
                        for (lid, mat_handle) in &base_elevations {
                            if lid.0 == layer_id {
                                if let Some(mat) = radar_materials.get_mut(&mat_handle.0) {
                                    if let Some(image) = images.get_mut(&mat.reflectivity_texture) {
                                        image.data = Some(data.clone());
                                    }
                                }
                            }
                        }
                    }
                }

                ui_state.0.sync_layers(&layer_states);
                notify_state(&mut events, &ui_state.0);
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

        let layer_state = layer_states.0
            .entry(layer_id.0.clone())
            .or_insert_with(|| RadarLayerState::new(10.0));

        // Store frame for moment-switch use.
        let active_moment = layer_state.active_moment.clone();
        layer_state.last_frame = Some(frame.clone());

        let data = frame.moment_data(&active_moment);
        let moment_idx = active_moment.index() as f32;

        let Some(mat) = radar_materials.get_mut(&mat_handle.0) else { continue };
        mat.moment_params.x = moment_idx;
        let tex_handle = mat.reflectivity_texture.clone();

        if frame.num_rays == layer_state.base_dims.num_rays && frame.num_gates == layer_state.base_dims.num_gates {
            if let Some(image) = images.get_mut(&tex_handle) {
                image.data = Some(data.clone());
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
                data.clone(),
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
            layer_state.base_dims.num_rays = frame.num_rays;
            layer_state.base_dims.num_gates = frame.num_gates;
        }
    }
}
