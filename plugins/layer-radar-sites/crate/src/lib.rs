use bevy::{
    asset::embedded_asset,
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::ShaderRef,
};
use bevy::ecs::observer::On;
use bevy::picking::prelude::{Pickable, Pointer};
use bevy::picking::events::Click;
use nexrad_core::sites;
use nexrad_render::{OverlayLayerId, SiteClickNotifier};

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

pub struct RadarSitesPlugin;

impl Plugin for RadarSitesPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "shaders/site_marker.wgsl");
        app.add_plugins(MaterialPlugin::<SiteMarkerMaterial>::default())
            .add_systems(Startup, spawn_radar_sites);
    }
}

fn spawn_radar_sites(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<SiteMarkerMaterial>>,
) {
    let cylinder = meshes.add(
        Cylinder::new(SITE_MARKER_RADIUS, SITE_MARKER_HEIGHT)
            .mesh()
            .resolution(32),
    );
    for site in sites::SITES.iter() {
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
            RadarSiteMarker {
                site_id: site.id.to_string(),
            },
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
    log::info!("spawned {} radar site markers", sites::SITES.len());
}
