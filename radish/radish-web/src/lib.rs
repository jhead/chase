use async_channel::Sender;
use bevy::prelude::*;
use radish_core::types::{ElevationScan, RadarVolume};
use std::{
    collections::HashMap,
    sync::{OnceLock, RwLock},
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

// Engine
use radish_render::{CommandBusReceiver, EnginePlugin, PluginEvent};

// Plugins
use layer_basemap::BasemapPlugin;
use layer_radar_l2::{
    AnimationFrame, AnimationFrameSlots, ExternalVolumeReceiver,
    RadarL2Plugin, TaggedVolume,
};
use layer_noaa_alerts::NoaaAlertsPlugin;
use layer_radar_sites::{RadarSitesPlugin, SiteRegistry};

// ── Static channels ─────────────────────────────────────────────────────────

/// Channel from JS into Bevy: tagged volumes sent here are drained each frame.
static VOLUME_TX: OnceLock<Sender<TaggedVolume>> = OnceLock::new();

/// Per-layer scan accumulators: add_scan() appends here, commit_volume() drains and sends.
static PENDING_SCANS: OnceLock<RwLock<HashMap<String, Vec<ElevationScan>>>> = OnceLock::new();

/// Per-layer animation frame slots. Shared Arc between JS and Bevy.
static ANIM_SLOTS: OnceLock<AnimationFrameSlots> = OnceLock::new();

/// Unified command channel (JS → Bevy).
static CMD_TX: OnceLock<Sender<serde_json::Value>> = OnceLock::new();

/// Unified event callback (Bevy → JS).
static EVENT_CB: OnceLock<js_sys::Function> = OnceLock::new();

// ── App entry point ─────────────────────────────────────────────────────────

#[wasm_bindgen(start)]
pub fn run() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();

    // Volume channel (JS → radar-l2 plugin)
    let (vol_tx, vol_rx) = async_channel::unbounded::<TaggedVolume>();
    VOLUME_TX.set(vol_tx).ok();
    PENDING_SCANS.set(RwLock::new(HashMap::new())).ok();

    // Animation frame slots
    let anim_slots = AnimationFrameSlots::default();
    ANIM_SLOTS.set(anim_slots.clone()).ok();

    // Unified command channel
    let (cmd_tx, cmd_rx) = async_channel::unbounded::<serde_json::Value>();
    CMD_TX.set(cmd_tx).ok();

    App::new()
        // Unified command bus
        .insert_resource(CommandBusReceiver(cmd_rx))
        // Radar L2 resources
        .insert_resource(ExternalVolumeReceiver(vol_rx))
        .insert_resource(anim_slots)
        // Shared resources
        .init_resource::<SiteRegistry>()
        // Default Bevy plugins
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                canvas: Some("#radish-bevy-canvas".to_string()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: false,
                ..default()
            }),
            ..default()
        }))
        // Engine + layer plugins
        .add_plugins(EnginePlugin)
        .add_plugins(BasemapPlugin)
        .add_plugins(RadarL2Plugin::default())
        .add_plugins(NoaaAlertsPlugin)
        .add_plugins(RadarSitesPlugin)
        // Drain plugin events to JS
        .add_systems(Update, drain_plugin_events)
        .run();
}

// ── Event callback ──────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn set_event_callback(cb: js_sys::Function) {
    EVENT_CB.set(cb).ok();
}

fn drain_plugin_events(mut events: MessageReader<PluginEvent>) {
    for event in events.read() {
        if let Some(cb) = EVENT_CB.get() {
            let json = serde_json::json!({
                "name": event.name,
                "data": event.data,
            });
            let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(&json.to_string()));
        }
    }
}

// ── Command routing ─────────────────────────────────────────────────────────

/// Send a command to the renderer. `json` is a JSON-serialized command.
/// Commands are broadcast as `RawCommand` Bevy messages; each plugin
/// parses what it recognizes.
#[wasm_bindgen]
pub fn send_command(json: &str) {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
        if let Some(tx) = CMD_TX.get() {
            let _ = tx.try_send(v);
        }
    }
}

// ── Radar L2 data functions ─────────────────────────────────────────────────

/// Append one elevation scan to the pending buffer for the given layer.
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

// ── Direct S3 fetch/parse exports ────────────────────────────────────────────

/// Per-layer frame store: layer_id → (key → AnimationFrame).
/// Frames are stored here by `load_frame`/`load_initial_frame` and read by `apply_frame`.
static FRAME_CACHE: OnceLock<RwLock<HashMap<String, HashMap<String, AnimationFrame>>>> = OnceLock::new();

fn frame_cache() -> &'static RwLock<HashMap<String, HashMap<String, AnimationFrame>>> {
    FRAME_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn store_frame(layer_id: &str, key: &str, frame: AnimationFrame) {
    if let Ok(mut cache) = frame_cache().write() {
        cache
            .entry(layer_id.to_string())
            .or_default()
            .insert(key.to_string(), frame);
    }
}

fn apply_frame_from_cache(layer_id: &str, key: &str) {
    let frame = frame_cache()
        .read()
        .ok()
        .and_then(|c| c.get(layer_id)?.get(key).cloned());

    if let (Some(slots), Some(frame)) = (ANIM_SLOTS.get(), frame) {
        let slot = slots.slot_for(layer_id);
        if let Ok(mut g) = slot.write() {
            *g = Some(frame);
        }
    }
}

fn elevation_to_frame(elev: &radish_core::types::ElevationScan) -> AnimationFrame {
    let data: Vec<u8> = elev
        .reflectivity
        .iter()
        .map(|&v| (v * 255.0).round() as u8)
        .collect();
    AnimationFrame {
        num_rays: elev.num_rays,
        num_gates: elev.num_gates,
        data,
    }
}

/// List available radar frames for `site` on `date` ("YYYY/MM/DD").
/// Returns a JSON string: `{ files: string[], timestamps: string[], count: number }`.
#[wasm_bindgen]
pub fn list_radar_frames(site: String, date: String) -> js_sys::Promise {
    future_to_promise(async move {
        let mut files = radish_fetch::list_radar_files(&site, &date)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        // list_radar_files returns newest-first; reverse to ascending for animation
        files.reverse();

        let timestamps: Vec<String> = files
            .iter()
            .map(|f| {
                // S3 key format: YYYY/MM/DD/SITE/SITE_YYYYMMDD_HHMMSS_V06
                // Extract the HHMMSS part from the filename component
                let filename = f.rsplit('/').next().unwrap_or(f.as_str());
                let parts: Vec<&str> = filename.split('_').collect();
                if parts.len() >= 3 {
                    let t = parts[2]; // HHMMSS
                    if t.len() >= 4 {
                        return format!("{}:{}Z", &t[..2], &t[2..4]);
                    }
                }
                String::new()
            })
            .collect();

        let count = files.len();
        let json = serde_json::json!({ "files": files, "timestamps": timestamps, "count": count });
        Ok(JsValue::from_str(&json.to_string()))
    })
}

/// Receive a postcard-encoded `RadarVolume` from the fetch worker, apply the first
/// elevation as the initial animation frame, and send the volume to the renderer to
/// create the 3D mesh. This replaces `load_initial_frame`.
#[wasm_bindgen]
pub fn receive_radar_volume(
    layer_id: String,
    key: String,
    site_id: String,
    bytes: &[u8],
) -> Result<(), JsValue> {
    let mut volume: RadarVolume = postcard::from_bytes(bytes)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    if volume.elevations.is_empty() {
        return Err(JsValue::from_str("no elevation scans in volume"));
    }

    let elev = volume.elevations.remove(0);
    let frame = elevation_to_frame(&elev);

    store_frame(&layer_id, &key, frame.clone());
    if let Some(slots) = ANIM_SLOTS.get() {
        let slot = slots.slot_for(&layer_id);
        if let Ok(mut g) = slot.write() {
            *g = Some(frame);
        }
    }

    let tagged = TaggedVolume {
        layer_id: layer_id.clone(),
        volume: RadarVolume {
            site: site_id,
            elevations: vec![elev],
        },
    };
    if let Some(tx) = VOLUME_TX.get() {
        let _ = tx.try_send(tagged);
    }

    Ok(())
}

/// Receive a postcard-encoded `RadarVolume` from the fetch worker and store its
/// first elevation in the frame cache for later playback via `apply_frame`.
/// This replaces `load_frame`.
#[wasm_bindgen]
pub fn cache_radar_frame(layer_id: String, key: String, bytes: &[u8]) -> Result<(), JsValue> {
    let volume: RadarVolume = postcard::from_bytes(bytes)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    if volume.elevations.is_empty() {
        return Err(JsValue::from_str("no elevation scans in volume"));
    }

    let frame = elevation_to_frame(&volume.elevations[0]);
    store_frame(&layer_id, &key, frame);

    Ok(())
}

/// Apply a previously loaded frame (by S3 key) to the animation slot for `layer_id`.
/// Must be called after `load_frame` or `load_initial_frame` has resolved for this key.
#[wasm_bindgen]
pub fn apply_frame(layer_id: &str, key: &str) {
    apply_frame_from_cache(layer_id, key);
}

/// Remove all cached frames for `layer_id` (call when tearing down a layer).
#[wasm_bindgen]
pub fn clear_frame_cache(layer_id: &str) {
    if let Ok(mut cache) = frame_cache().write() {
        cache.remove(layer_id);
    }
}
