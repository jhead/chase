pub mod commands;
pub mod radar_material;
pub mod radar_texture;
pub mod elevation_mesh;
pub mod state;

use bevy::{asset::embedded_asset, prelude::*};
use nexrad_core::{sites::RadarSite, types::ElevationScan};
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use nexrad_render::camera::orbit_camera::OrbitCamera;

use nexrad_render::OverlayLayerId;
use crate::{
    commands::RadarL2Command,
    elevation_mesh::build_elevation_mesh,
    radar_material::RadarMaterial,
    radar_texture::create_reflectivity_texture,
    state::{RadarLayerState, RadarLayerStates, UiStateResource},
};

const WORLD_ORIGIN_LAT: f64 = 36.0;
const WORLD_ORIGIN_LNG: f64 = -98.0;

// ── Tagged volume ─────────────────────────────────────────────────────────────

/// A `RadarVolume` tagged with the React layer that owns it.
pub struct TaggedVolume {
    pub layer_id: String,
    pub volume: nexrad_core::types::RadarVolume,
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

// ── Command receiver ──────────────────────────────────────────────────────────

#[derive(Resource)]
pub struct RadarL2CommandReceiver(pub async_channel::Receiver<RadarL2Command>);

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

        if app.world().get_resource::<RadarL2CommandReceiver>().is_some() {
            app.add_systems(Update, drain_radar_commands);
        }

        if app.world().get_resource::<AnimationFrameSlots>().is_some() {
            app.add_systems(Update, receive_animation_frames);
        }

        app.init_resource::<LoadStatus>()
            .init_resource::<state::StateNotifier>()
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
    for (i, (scan, (lower, upper))) in scans.iter().zip(bounds.iter()).enumerate() {
        let mesh = build_elevation_mesh(scan, *lower, *upper);
        let texture = create_reflectivity_texture(images, scan);
        let material = materials.add(RadarMaterial {
            reflectivity_texture: texture,
            params: Vec4::new(layer_state.threshold_dbz, layer_state.range_km, site_offset.x, site_offset.z),
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

fn receive_radar_data(
    mut commands: Commands,
    channel: Res<RadarDataChannel>,
    old_elevations: Query<(Entity, &LayerId), With<RadarElevation>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut status: ResMut<LoadStatus>,
    notifier: Res<state::StateNotifier>,
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

fn drain_radar_commands(
    mut commands: Commands,
    receiver: Res<RadarL2CommandReceiver>,
    elevations: Query<(Entity, &LayerId), With<RadarElevation>>,
    mut sweeps: Query<(&mut Visibility, &ElevationIndex, &LayerId), With<RadarElevation>>,
    notifier: Res<state::StateNotifier>,
    mut ui_state: ResMut<UiStateResource>,
    mut layer_states: ResMut<RadarLayerStates>,
    elev_material_handles: Query<(&MeshMaterial3d<RadarMaterial>, &LayerId), With<RadarElevation>>,
    mut radar_materials: ResMut<Assets<RadarMaterial>>,
) {
    while let Ok(cmd) = receiver.0.try_recv() {
        match cmd {
            RadarL2Command::RemoveLayer { layer_id } => {
                for (entity, lid) in &elevations {
                    if lid.0 == layer_id {
                        commands.entity(entity).despawn();
                    }
                }
                layer_states.0.remove(&layer_id);
                ui_state.0.sync_layers(&layer_states);
                notifier.notify(&ui_state.0);
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
                notifier.notify(&ui_state.0);
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
                notifier.notify(&ui_state.0);
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
                notifier.notify(&ui_state.0);
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
