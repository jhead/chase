pub mod data;
pub mod material;
pub mod mesh;

use bevy::{asset::embedded_asset, prelude::*};
use material::BasemapLineMaterial;
use radish_render::OverlayLayerId;

use self::{
    data::BasemapData,
    mesh::build_line_mesh,
};

// ── Public resource ───────────────────────────────────────────────────────────

/// Configuration for the basemap. Insert/update this resource to set the
/// geographic origin and visible radius.
///
/// For single-site use, set `origin_lat`/`origin_lng` to the radar site coordinates.
/// For multi-site composite views, set to the view centroid and increase `cull_radius_m`.
#[derive(Resource, Clone, PartialEq)]
pub struct BasemapConfig {
    pub origin_lat: f64,
    pub origin_lng: f64,
    /// Radius around origin (meters) beyond which line segments are discarded.
    /// Default 800km covers the full NEXRAD radar range with margin.
    pub cull_radius_m: f64,
}

impl Default for BasemapConfig {
    fn default() -> Self {
        Self {
            origin_lat: 36.0,
            origin_lng: -98.0,
            cull_radius_m: 4_500_000.0,
        }
    }
}

// ── Internal component ────────────────────────────────────────────────────────

/// Marker for entities owned by the basemap — despawned when config changes.
#[derive(Component)]
pub struct BasemapGeometry;

// ── Colors ───────────────────────────────────────────────────────────────────

const COLOR_STATES: Vec4 = Vec4::new(0.20, 0.20, 0.22, 1.0);
const COLOR_COUNTRIES: Vec4 = Vec4::new(0.25, 0.25, 0.27, 1.0);
const COLOR_COASTLINE: Vec4 = Vec4::new(0.22, 0.22, 0.24, 1.0);
const COLOR_LAKES: Vec4 = Vec4::new(0.18, 0.18, 0.20, 1.0);

// ── Plugin ────────────────────────────────────────────────────────────────────

pub struct BasemapPlugin;

impl Plugin for BasemapPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "shaders/basemap_line.wgsl");

        app.add_plugins(MaterialPlugin::<BasemapLineMaterial>::default())
            .init_resource::<BasemapConfig>()
            .insert_resource(ClearColor(Color::BLACK))
            .add_systems(Startup, spawn_basemap)
            .add_systems(Update, rebuild_on_config_change);
    }
}

// ── Systems ───────────────────────────────────────────────────────────────────

fn spawn_basemap(
    config: Res<BasemapConfig>,
    commands: Commands,
    meshes: ResMut<Assets<Mesh>>,
    materials: ResMut<Assets<BasemapLineMaterial>>,
) {
    build_and_spawn(&config, commands, meshes, materials);
}

fn rebuild_on_config_change(
    config: Res<BasemapConfig>,
    mut last_config: Local<Option<BasemapConfig>>,
    existing: Query<Entity, With<BasemapGeometry>>,
    mut commands: Commands,
    meshes: ResMut<Assets<Mesh>>,
    materials: ResMut<Assets<BasemapLineMaterial>>,
) {
    // On the very first Update tick the Startup system has already built the basemap.
    // Record the current config and skip — only rebuild on subsequent changes.
    if last_config.is_none() {
        *last_config = Some(config.clone());
        return;
    }

    if last_config.as_ref() == Some(config.as_ref()) {
        return;
    }
    *last_config = Some(config.clone());

    for entity in &existing {
        commands.entity(entity).despawn();
    }
    build_and_spawn(&config, commands, meshes, materials);
}

fn build_and_spawn(
    config: &BasemapConfig,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<BasemapLineMaterial>>,
) {
    log::info!(
        "building basemap at ({:.2}, {:.2}), cull radius {:.0}km",
        config.origin_lat,
        config.origin_lng,
        config.cull_radius_m / 1000.0,
    );

    let data = BasemapData::build(config.origin_lat, config.origin_lng, config.cull_radius_m);

    let layers: &[(&str, &data::BasemapLayer, Vec4)] = &[
        ("states", &data.states, COLOR_STATES),
        ("countries", &data.countries, COLOR_COUNTRIES),
        ("coastline", &data.coastline, COLOR_COASTLINE),
        ("lakes", &data.lakes, COLOR_LAKES),
    ];

    let mat = materials.add(BasemapLineMaterial {});

    for (name, layer, color) in layers {
        let Some(mesh) = build_line_mesh(layer, *color) else {
            log::warn!("basemap layer '{name}' has no visible geometry");
            continue;
        };
        log::info!(
            "basemap layer '{}': {} line segments",
            name,
            layer.vertices.len() / 2
        );
        commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(mat.clone()),
            Transform::default(),
            BasemapGeometry,
            OverlayLayerId("basemap".to_string()),
        ));
    }
}
