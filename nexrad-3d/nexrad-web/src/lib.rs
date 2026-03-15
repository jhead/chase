use async_channel::Sender;
use bevy::prelude::*;
use nexrad_core::types::{ElevationScan, RadarVolume};
use nexrad_render::{
    AnimationFrame, AnimationFrameSlot, ExternalVolumeReceiver, JsCommand, JsCommandReceiver,
    RadarPlugin, StateNotifier, UiState,
};
use std::sync::{Arc, OnceLock, RwLock};
use wasm_bindgen::prelude::*;

/// Channel from JS into Bevy: volumes sent here are drained each frame by the plugin.
static VOLUME_TX: OnceLock<Sender<RadarVolume>> = OnceLock::new();

/// Scans accumulated by add_scan() until commit_volume() sends them as one volume.
static PENDING_SCANS: OnceLock<RwLock<Vec<ElevationScan>>> = OnceLock::new();

/// Channel from JS into Bevy: commands sent here are drained each frame by drain_js_commands.
static CMD_TX: OnceLock<Sender<JsCommand>> = OnceLock::new();

/// Latest animation frame slot: JS overwrites, Bevy reads once per tick (no queue lag).
static ANIM_SLOT: OnceLock<Arc<RwLock<Option<AnimationFrame>>>> = OnceLock::new();

/// JS callback registered via set_state_callback(). Called from the StateNotifier on state change.
static STATE_CB: OnceLock<js_sys::Function> = OnceLock::new();

#[wasm_bindgen(start)]
pub fn run() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();

    let (vol_tx, vol_rx) = async_channel::unbounded::<RadarVolume>();
    let (cmd_tx, cmd_rx) = async_channel::unbounded::<JsCommand>();
    let anim_slot = Arc::new(RwLock::new(None::<AnimationFrame>));

    VOLUME_TX.set(vol_tx).ok();
    PENDING_SCANS.set(RwLock::new(Vec::new())).ok();
    CMD_TX.set(cmd_tx).ok();
    ANIM_SLOT.set(anim_slot.clone()).ok();

    App::new()
        .insert_resource(ExternalVolumeReceiver(vol_rx))
        .insert_resource(JsCommandReceiver(cmd_rx))
        .insert_resource(AnimationFrameSlot(anim_slot))
        .insert_resource(StateNotifier(Some(Box::new(|state: &UiState| {
            if let Some(cb) = STATE_CB.get() {
                if let Ok(json) = serde_json::to_string(state) {
                    let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(&json));
                }
            }
        }))))
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                canvas: Some("#nexrad-bevy-canvas".to_string()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: false,
                ..default()
            }),
            ..default()
        }))
        .add_plugins(RadarPlugin::default())
        .run();
}

/// Register a JS callback to receive UiState updates from Bevy.
/// Called once after WASM init. The callback receives a JSON string matching UiState.
#[wasm_bindgen]
pub fn set_state_callback(cb: js_sys::Function) {
    STATE_CB.set(cb).ok();
}

/// Send a command to the Bevy renderer. `json` is a JSON-serialized JsCommand discriminated union.
/// Example: `{"type":"SetThreshold","dbz":20}`
#[wasm_bindgen]
pub fn send_command(json: &str) {
    if let Some(cmd) = JsCommand::from_json(json) {
        if let Some(tx) = CMD_TX.get() {
            let _ = tx.try_send(cmd);
        }
    }
}

/// Append one elevation scan. Data is row-major: reflectivity[ray * num_gates + gate].
/// Call from JS after fetching/parsing a sweep (e.g. via nexrad-level-2-data).
#[wasm_bindgen]
pub fn add_scan(
    elevation_angle_deg: f32,
    gate_size_m: f32,
    first_gate_m: f32,
    azimuths: &js_sys::Float32Array,
    reflectivity: &js_sys::Float32Array,
) {
    #[cfg(target_arch = "wasm32")]
    {
        let num_rays = azimuths.length() as usize;
        if num_rays == 0 {
            return;
        }
        let total = reflectivity.length() as usize;
        let num_gates = total.checked_div(num_rays).unwrap_or(0);
        if num_gates == 0 {
            return;
        }

        let mut az_vec = vec![0.0_f32; num_rays];
        azimuths.copy_to(&mut az_vec[..]);
        let mut ref_vec = vec![0.0_f32; total];
        reflectivity.copy_to(&mut ref_vec[..]);

        let scan = ElevationScan {
            elevation_angle: elevation_angle_deg,
            num_rays,
            num_gates,
            gate_size_m,
            first_gate_m,
            azimuths: az_vec,
            reflectivity: ref_vec,
        };

        if let Some(cell) = PENDING_SCANS.get() {
            if let Ok(mut pending) = cell.write() {
                pending.push(scan);
            }
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    let _ = (elevation_angle_deg, gate_size_m, first_gate_m, azimuths, reflectivity);
}

/// Send the accumulated scans as one volume and clear the buffer.
/// Call from JS after all add_scan() calls for the current volume.
#[wasm_bindgen]
pub fn commit_volume(site_id: &str) {
    if let (Some(tx), Some(cell)) = (VOLUME_TX.get(), PENDING_SCANS.get()) {
        if let Ok(mut pending) = cell.write() {
            if pending.is_empty() {
                return;
            }
            let volume = RadarVolume {
                site: site_id.to_string(),
                elevations: std::mem::take(&mut *pending),
            };
            let _ = tx.try_send(volume);
        }
    }
}

/// Update the base elevation (tilt 0) texture in-place for animation.
/// `data` is pre-quantized R8Unorm (0-255). Called from JS on each animation frame.
/// Overwrites the shared slot so Bevy always sees the latest frame (no queue lag).
#[wasm_bindgen]
pub fn update_base_texture(num_rays: u32, num_gates: u32, data: &[u8]) {
    if let Some(slot) = ANIM_SLOT.get() {
        if let Ok(mut g) = slot.write() {
            *g = Some(AnimationFrame {
                num_rays: num_rays as usize,
                num_gates: num_gates as usize,
                data: data.to_vec(),
            });
        }
    }
}
