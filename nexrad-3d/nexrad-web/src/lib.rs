use async_channel::Sender;
use bevy::prelude::*;
use nexrad_core::types::{ElevationScan, RadarVolume};
use nexrad_render::{
    AlertClickCallback, AlertCommand, AlertCommandReceiver, AlertCommandSender,
    AnimationFrame, AnimationFrameSlots, AlertsPlugin, ExternalVolumeReceiver, JsCommand,
    JsCommandReceiver, RadarPlugin, SiteClickNotifier, StateNotifier, TaggedVolume, UiState,
};
use std::{
    collections::HashMap,
    sync::{OnceLock, RwLock},
};
use wasm_bindgen::prelude::*;

/// Channel from JS into Bevy: tagged volumes sent here are drained each frame.
static VOLUME_TX: OnceLock<Sender<TaggedVolume>> = OnceLock::new();

/// Per-layer scan accumulators: add_scan() appends here, commit_volume() drains and sends.
static PENDING_SCANS: OnceLock<RwLock<HashMap<String, Vec<ElevationScan>>>> = OnceLock::new();

/// Channel from JS into Bevy: commands sent here are drained each frame.
static CMD_TX: OnceLock<Sender<JsCommand>> = OnceLock::new();

/// Per-layer animation frame slots. Shared Arc between JS and Bevy.
/// JS writes into a slot keyed by layer_id; Bevy drains each slot once per tick.
static ANIM_SLOTS: OnceLock<AnimationFrameSlots> = OnceLock::new();

/// JS callback registered via set_state_callback(). Called on state change.
static STATE_CB: OnceLock<js_sys::Function> = OnceLock::new();

/// JS callback registered via set_alert_click_callback(). Called when an alert polygon is clicked.
static ALERT_CLICK_CB: OnceLock<js_sys::Function> = OnceLock::new();

/// JS callback registered via set_site_click_callback(). Called when a radar site marker is clicked.
static SITE_CLICK_CB: OnceLock<js_sys::Function> = OnceLock::new();

#[wasm_bindgen(start)]
pub fn run() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();

    let (vol_tx, vol_rx) = async_channel::unbounded::<TaggedVolume>();
    let (cmd_tx, cmd_rx) = async_channel::unbounded::<JsCommand>();
    let (alert_cmd_tx, alert_cmd_rx) = async_channel::unbounded::<AlertCommand>();
    let anim_slots = AnimationFrameSlots::default();

    VOLUME_TX.set(vol_tx).ok();
    PENDING_SCANS.set(RwLock::new(HashMap::new())).ok();
    CMD_TX.set(cmd_tx).ok();
    ANIM_SLOTS.set(anim_slots.clone()).ok();

    App::new()
        .insert_resource(ExternalVolumeReceiver(vol_rx))
        .insert_resource(JsCommandReceiver(cmd_rx))
        .insert_resource(AlertCommandSender(alert_cmd_tx))
        .insert_resource(AlertCommandReceiver(alert_cmd_rx))
        .insert_resource(anim_slots)
        .insert_resource(StateNotifier(Some(Box::new(|state: &UiState| {
            if let Some(cb) = STATE_CB.get() {
                if let Ok(json) = serde_json::to_string(state) {
                    let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(&json));
                }
            }
        }))))
        .insert_resource(AlertClickCallback(Some(Box::new(|alert_id: &str| {
            if let Some(cb) = ALERT_CLICK_CB.get() {
                let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(alert_id));
            }
        }))))
        .insert_resource(SiteClickNotifier(Some(Box::new(|site_id: &str| {
            // Defer to next microtask so the JS call happens after winit releases
            // its rAF RefCell borrow, preventing "RefCell already borrowed" panics.
            let site_id = site_id.to_string();
            #[cfg(target_arch = "wasm32")]
            wasm_bindgen_futures::spawn_local(async move {
                if let Some(cb) = SITE_CLICK_CB.get() {
                    let _ = cb.call1(&wasm_bindgen::JsValue::NULL, &wasm_bindgen::JsValue::from_str(&site_id));
                }
            });
            #[cfg(not(target_arch = "wasm32"))]
            {
                if let Some(cb) = SITE_CLICK_CB.get() {
                    let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(&site_id));
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
        .add_plugins(AlertsPlugin)
        .run();
}

/// Register a JS callback to run when an alert polygon is clicked. Receives the alert ID string.
#[wasm_bindgen]
pub fn set_alert_click_callback(cb: js_sys::Function) {
    ALERT_CLICK_CB.set(cb).ok();
}

/// Register a JS callback to receive UiState updates from Bevy.
#[wasm_bindgen]
pub fn set_state_callback(cb: js_sys::Function) {
    STATE_CB.set(cb).ok();
}

/// Register a JS callback to be invoked when a radar site marker is clicked. The callback receives the site ID string (e.g. "KDMX").
#[wasm_bindgen]
pub fn set_site_click_callback(cb: js_sys::Function) {
    SITE_CLICK_CB.set(cb).ok();
}

/// Send a command to the Bevy renderer. `json` is a JSON-serialized JsCommand.
#[wasm_bindgen]
pub fn send_command(json: &str) {
    if let Some(cmd) = JsCommand::from_json(json) {
        if let Some(tx) = CMD_TX.get() {
            let _ = tx.try_send(cmd);
        }
    }
}

/// Append one elevation scan to the pending buffer for the given layer.
/// Data is row-major: reflectivity[ray * num_gates + gate].
#[wasm_bindgen]
pub fn add_scan(
    layer_id: &str,
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
                pending.entry(layer_id.to_string()).or_default().push(scan);
            }
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    let _ = (layer_id, elevation_angle_deg, gate_size_m, first_gate_m, azimuths, reflectivity);
}

/// Send the accumulated scans for `layer_id` as one tagged volume, then clear the buffer.
#[wasm_bindgen]
pub fn commit_volume(layer_id: &str, site_id: &str) {
    if let (Some(tx), Some(cell)) = (VOLUME_TX.get(), PENDING_SCANS.get()) {
        if let Ok(mut pending) = cell.write() {
            let scans = pending.entry(layer_id.to_string()).or_default();
            if scans.is_empty() {
                return;
            }
            let volume = RadarVolume {
                site: site_id.to_string(),
                elevations: std::mem::take(scans),
            };
            let tagged = TaggedVolume {
                layer_id: layer_id.to_string(),
                volume,
            };
            let _ = tx.try_send(tagged);
        }
    }
}

/// Update the base elevation texture for a specific layer (for animation playback).
/// `data` is pre-quantized R8Unorm (0-255). Overwrites the slot so Bevy always
/// sees the latest frame without queue lag.
#[wasm_bindgen]
pub fn update_layer_texture(layer_id: &str, num_rays: u32, num_gates: u32, data: &[u8]) {
    if let Some(slots) = ANIM_SLOTS.get() {
        let slot = slots.slot_for(layer_id);
        if let Ok(mut g) = slot.write() {
            *g = Some(AnimationFrame {
                num_rays: num_rays as usize,
                num_gates: num_gates as usize,
                data: data.to_vec(),
            });
        }
    }
}
