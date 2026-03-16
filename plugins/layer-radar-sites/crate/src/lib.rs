use bevy::{
    asset::embedded_asset,
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::ShaderRef,
};
use bevy::ecs::observer::On;
use bevy::picking::prelude::{Pickable, Pointer};
use bevy::picking::events::Click;
use nexrad_render::{OverlayLayerId, SiteClickNotifier, SiteRegistry};

const WORLD_ORIGIN_LAT: f64 = 36.0;
const WORLD_ORIGIN_LNG: f64 = -98.0;
const SITE_MARKER_RADIUS: f32 = 15_000.0;
const SITE_MARKER_HEIGHT: f32 = 500.0;
const SITE_MARKER_COLOR: Vec4 = Vec4::new(0.0, 0.8, 1.0, 1.0);

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct SiteMarkerMaterial {
    #[uniform(0)]
    pub params_a: Vec4,
    #[uniform(1)]
    pub params_b: Vec4,
}

impl Material for SiteMarkerMaterial {
    fn fragment_shader() -> ShaderRef {
        "embedded://layer_radar_sites/shaders/site_marker.wgsl".into()
    }
    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Opaque
    }
}

#[derive(Component, Clone, Debug)]
pub struct RadarSiteMarker {
    pub site_id: String,
}

// ── Command ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SiteData {
    pub id: String,
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Clone)]
pub enum RadarSitesCommand {
    SetSites(Vec<SiteData>),
}

impl RadarSitesCommand {
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        match v["type"].as_str()? {
            "SetRadarSites" => {
                let arr = v["sites"].as_array()?;
                let sites = arr.iter().filter_map(|s| {
                    Some(SiteData {
                        id: s["id"].as_str()?.to_string(),
                        lat: s["lat"].as_f64()?,
                        lng: s["lng"].as_f64()?,
                    })
                }).collect();
                Some(RadarSitesCommand::SetSites(sites))
            }
            _ => None,
        }
    }
}

#[derive(Resource)]
pub struct RadarSitesCommandReceiver(pub async_channel::Receiver<RadarSitesCommand>);

// ── Plugin ────────────────────────────────────────────────────────────────────

pub struct RadarSitesPlugin;

impl Plugin for RadarSitesPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "shaders/site_marker.wgsl");
        app.add_plugins(MaterialPlugin::<SiteMarkerMaterial>::default())
            .add_systems(Update, receive_radar_sites);
    }
}

fn receive_radar_sites(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<SiteMarkerMaterial>>,
    receiver: Res<RadarSitesCommandReceiver>,
    existing: Query<Entity, With<RadarSiteMarker>>,
    mut registry: ResMut<SiteRegistry>,
) {
    while let Ok(cmd) = receiver.0.try_recv() {
        match cmd {
            RadarSitesCommand::SetSites(sites) => {
                for entity in &existing {
                    commands.entity(entity).despawn();
                }
                registry.0.clear();
                for site in &sites {
                    registry.0.insert(site.id.clone(), (site.lat, site.lng));
                }
                let cylinder = meshes.add(
                    Cylinder::new(SITE_MARKER_RADIUS, SITE_MARKER_HEIGHT)
                        .mesh()
                        .resolution(32),
                );
                for site in &sites {
                    let (x, _, z) = nexrad_core::geo::wgs84_to_bevy(
                        site.lat,
                        site.lng,
                        WORLD_ORIGIN_LAT,
                        WORLD_ORIGIN_LNG,
                    );
                    let center = Vec3::new(x, SITE_MARKER_HEIGHT * 0.5, z);
                    let material = materials.add(SiteMarkerMaterial {
                        params_a: Vec4::new(center.x, center.y, center.z, SITE_MARKER_RADIUS),
                        params_b: SITE_MARKER_COLOR,
                    });
                    let mut entity_commands = commands.spawn((
                        Mesh3d(cylinder.clone()),
                        MeshMaterial3d(material),
                        Transform::from_translation(Vec3::new(x, SITE_MARKER_HEIGHT * 0.5, z)),
                        OverlayLayerId("radar-sites".to_string()),
                        RadarSiteMarker { site_id: site.id.clone() },
                        Pickable::default(),
                    ));
                    entity_commands.observe(
                        |evt: On<Pointer<Click>>,
                         markers: Query<&RadarSiteMarker>,
                         notifier: Res<SiteClickNotifier>| {
                            if let Ok(marker) = markers.get(evt.entity) {
                                notifier.notify(&marker.site_id);
                            }
                        },
                    );
                }
                log::info!("radar-sites: spawned {} markers", sites.len());
            }
        }
    }
}
