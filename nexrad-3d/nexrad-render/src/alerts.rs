//! NWS alert polygons layer: receive SetAlerts/ClearAlerts, spawn flat meshes, handle click callback.

use bevy::prelude::*;
use nexrad_core::geo;
use crate::plugin::{AlertCommand, AlertCommandReceiver};
use crate::rendering::alert_mesh::build_alert_mesh;

const WORLD_ORIGIN_LAT: f64 = 36.0;
const WORLD_ORIGIN_LNG: f64 = -98.0;
const ALERT_POLYGON_HEIGHT: f32 = 500.0;

// ── Components ───────────────────────────────────────────────────────────────

#[derive(Component)]
pub struct AlertPolygon;

#[derive(Component, Clone)]
pub struct AlertId(pub String);

#[derive(Component, Clone)]
pub struct AlertLayerId(pub String);

// ── Resources ────────────────────────────────────────────────────────────────

#[derive(Resource, Default)]
pub struct AlertClickCallback(pub Option<Box<dyn Fn(&str) + Send + Sync>>);

// ── Plugin ───────────────────────────────────────────────────────────────────

pub struct AlertsPlugin;

impl Plugin for AlertsPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(MeshPickingPlugin)
            .insert_resource(MeshPickingSettings {
                require_markers: true,
                ..default()
            })
            .init_resource::<AlertClickCallback>()
            .add_systems(Update, receive_alert_data)
            .add_systems(Update, on_alert_click);
    }
}

// ── Systems ──────────────────────────────────────────────────────────────────

fn receive_alert_data(
    mut commands: Commands,
    receiver: Res<AlertCommandReceiver>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    alert_entities: Query<(Entity, &AlertLayerId), With<AlertPolygon>>,
) {
    while let Ok(cmd) = receiver.0.try_recv() {
        match cmd {
            AlertCommand::ClearAlerts { layer_id } => {
                for (entity, lid) in &alert_entities {
                    if lid.0 == layer_id {
                        commands.entity(entity).despawn();
                    }
                }
            }
            AlertCommand::SetAlerts { layer_id, alerts } => {
                for (entity, lid) in &alert_entities {
                    if lid.0 == layer_id {
                        commands.entity(entity).despawn();
                    }
                }
                log::info!(
                    "alerts: SetAlerts layer_id={} count={}",
                    layer_id,
                    alerts.len()
                );
                let mut spawned = 0u32;
                for alert in alerts {
                    let vertices: Vec<[f32; 3]> = alert
                        .coordinates
                        .iter()
                        .map(|c| {
                            let (x, _, z) = geo::wgs84_to_bevy(
                                c[1],
                                c[0],
                                WORLD_ORIGIN_LAT,
                                WORLD_ORIGIN_LNG,
                            );
                            [x, ALERT_POLYGON_HEIGHT, z]
                        })
                        .collect();
                    if vertices.len() < 3 {
                        log::warn!(
                            "alerts: skip alert id={} (ring has {} points)",
                            alert.id,
                            vertices.len()
                        );
                        continue;
                    }
                    let mesh = build_alert_mesh(&vertices);
                    let mesh_handle = meshes.add(mesh);
                    let [r, g, b, a] = alert.color;
                    let material = materials.add(StandardMaterial {
                        base_color: Color::srgba(r, g, b, a),
                        alpha_mode: AlphaMode::Blend,
                        unlit: true,
                        ..default()
                    });
                    commands.spawn((
                        Mesh3d(mesh_handle),
                        MeshMaterial3d(material),
                        Transform::default(),
                        Visibility::Visible,
                        Pickable::default(),
                        AlertPolygon,
                        AlertId(alert.id.clone()),
                        AlertLayerId(layer_id.clone()),
                    ));
                    spawned += 1;
                }
                log::info!("alerts: spawned {} polygon(s) for layer_id={}", spawned, layer_id);
            }
        }
    }
}

fn on_alert_click(
    mut click_events: MessageReader<Pointer<Click>>,
    callback: Res<AlertClickCallback>,
    query: Query<&AlertId, With<AlertPolygon>>,
) {
    let Some(cb) = &callback.0 else { return };
    for event in click_events.read() {
        if let Ok(alert_id) = query.get(event.entity) {
            cb(alert_id.0.as_str());
        }
    }
}
