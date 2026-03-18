//! Core engine plugin: camera, lighting, layer visibility, command/event bus.

use bevy::{light::GlobalAmbientLight, prelude::*};
use crate::camera::orbit_camera::{CameraMode, OrbitCamera, OrbitCameraPlugin};
use crate::commands::{CommandBusReceiver, RawCommand};
use crate::events::PluginEvent;
use crate::overlay_types::OverlayLayerId;

// ── Engine commands ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum EngineCommand {
    ResetCamera,
    SetCameraMode(CameraMode),
    SetLayerVisible { layer_id: String, visible: bool },
}

impl EngineCommand {
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        match v["type"].as_str()? {
            "ResetCamera" => Some(EngineCommand::ResetCamera),
            "SetCameraMode" => {
                let cam_mode = match v["mode"].as_str().unwrap_or("2d") {
                    "3d" => CameraMode::Tilt3D,
                    _ => CameraMode::Pan2D,
                };
                Some(EngineCommand::SetCameraMode(cam_mode))
            }
            "SetLayerVisible" => {
                let layer_id = v["layer_id"].as_str()?.to_string();
                let visible = v["visible"].as_bool().unwrap_or(true);
                Some(EngineCommand::SetLayerVisible { layer_id, visible })
            }
            _ => None,
        }
    }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

pub struct EnginePlugin;

impl Plugin for EnginePlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(OrbitCameraPlugin)
            .add_message::<RawCommand>()
            .add_message::<PluginEvent>()
            .add_systems(Startup, setup_scene_lighting)
            .add_systems(Update, drain_engine_commands);

        if app.world().get_resource::<CommandBusReceiver>().is_some() {
            app.add_systems(Update, drain_command_bus.before(drain_engine_commands));
        }
    }
}

// ── Systems ──────────────────────────────────────────────────────────────────

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

/// Bridge the async_channel into Bevy messages. Runs once per frame.
fn drain_command_bus(
    receiver: Res<CommandBusReceiver>,
    mut writer: MessageWriter<RawCommand>,
) {
    while let Ok(v) = receiver.0.try_recv() {
        writer.write(RawCommand(v));
    }
}

/// Handle engine-level commands from the unified command bus.
fn drain_engine_commands(
    mut events: MessageReader<RawCommand>,
    mut camera: Query<&mut OrbitCamera>,
    mut overlay_visibility: Query<(&OverlayLayerId, &mut Visibility)>,
    mut camera_mode: ResMut<CameraMode>,
) {
    for event in events.read() {
        if let Some(cmd) = EngineCommand::from_json(&event.0) {
            match cmd {
                EngineCommand::ResetCamera => {
                    if let Ok(mut cam) = camera.single_mut() {
                        let focus = cam.focus;
                        *cam = OrbitCamera::default();
                        cam.focus = focus;
                    }
                }
                EngineCommand::SetCameraMode(new_mode) => {
                    *camera_mode = new_mode;
                }
                EngineCommand::SetLayerVisible { layer_id, visible } => {
                    for (lid, mut vis) in &mut overlay_visibility {
                        if lid.0 == layer_id {
                            *vis = if visible { Visibility::Visible } else { Visibility::Hidden };
                        }
                    }
                }
            }
        }
    }
}
