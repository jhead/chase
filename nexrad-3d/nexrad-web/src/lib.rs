use async_channel::Sender;
use bevy::prelude::*;
use nexrad_core::types::{ElevationScan, RadarVolume};
use std::{
    collections::HashMap,
    sync::{OnceLock, RwLock},
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

// Engine
use nexrad_render::{
    EngineCommand, EngineCommandReceiver, EnginePlugin,
    SiteClickNotifier, SiteRegistry,
};

// Plugins
use layer_basemap::BasemapPlugin;
use layer_radar_l2::{
    AnimationFrame, AnimationFrameSlots, ExternalVolumeReceiver,
    RadarL2Plugin, TaggedVolume,
    commands::RadarL2Command, RadarL2CommandReceiver,
    state::{StateNotifier, UiState},
};
use layer_noaa_alerts::{AlertCommand, AlertCommandReceiver, NoaaAlertsPlugin, AlertClickCallback};
use layer_radar_sites::{RadarSitesPlugin, RadarSitesCommand, RadarSitesCommandReceiver};

// ── Static channels ─────────────────────────────────────────────────────────

/// Channel from JS into Bevy: tagged volumes sent here are drained each frame.
static VOLUME_TX: OnceLock<Sender<TaggedVolume>> = OnceLock::new();

/// Per-layer scan accumulators: add_scan() appends here, commit_volume() drains and sends.
static PENDING_SCANS: OnceLock<RwLock<HashMap<String, Vec<ElevationScan>>>> = OnceLock::new();

/// Per-layer animation frame slots. Shared Arc between JS and Bevy.
static ANIM_SLOTS: OnceLock<AnimationFrameSlots> = OnceLock::new();

/// Engine command channel.
static ENGINE_CMD_TX: OnceLock<Sender<EngineCommand>> = OnceLock::new();

/// Radar L2 command channel.
static RADAR_CMD_TX: OnceLock<Sender<RadarL2Command>> = OnceLock::new();

/// Alert command channel.
static ALERT_CMD_TX: OnceLock<Sender<AlertCommand>> = OnceLock::new();

/// Radar sites command channel.
static SITES_CMD_TX: OnceLock<Sender<RadarSitesCommand>> = OnceLock::new();

/// JS callback registered via set_state_callback().
static STATE_CB: OnceLock<js_sys::Function> = OnceLock::new();

/// JS callback registered via set_alert_click_callback().
static ALERT_CLICK_CB: OnceLock<js_sys::Function> = OnceLock::new();

/// JS callback registered via set_site_click_callback().
static SITE_CLICK_CB: OnceLock<js_sys::Function> = OnceLock::new();

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

    // Engine command channel
    let (engine_cmd_tx, engine_cmd_rx) = async_channel::unbounded::<EngineCommand>();
    ENGINE_CMD_TX.set(engine_cmd_tx).ok();

    // Radar L2 command channel
    let (radar_cmd_tx, radar_cmd_rx) = async_channel::unbounded::<RadarL2Command>();
    RADAR_CMD_TX.set(radar_cmd_tx).ok();

    // Alert command channel
    let (alert_cmd_tx, alert_cmd_rx) = async_channel::unbounded::<AlertCommand>();
    ALERT_CMD_TX.set(alert_cmd_tx).ok();

    // Radar sites command channel
    let (sites_cmd_tx, sites_cmd_rx) = async_channel::unbounded::<RadarSitesCommand>();
    SITES_CMD_TX.set(sites_cmd_tx).ok();

    App::new()
        // Engine resources
        .insert_resource(EngineCommandReceiver(engine_cmd_rx))
        // Radar L2 resources
        .insert_resource(ExternalVolumeReceiver(vol_rx))
        .insert_resource(RadarL2CommandReceiver(radar_cmd_rx))
        .insert_resource(anim_slots)
        .insert_resource(StateNotifier(Some(Box::new(|state: &UiState| {
            if let Some(cb) = STATE_CB.get() {
                if let Ok(json) = serde_json::to_string(state) {
                    let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(&json));
                }
            }
        }))))
        // Alert resources
        .insert_resource(AlertCommandReceiver(alert_cmd_rx))
        // Radar sites resources
        .insert_resource(RadarSitesCommandReceiver(sites_cmd_rx))
        .init_resource::<SiteRegistry>()
        .insert_resource(AlertClickCallback(Some(Box::new(|alert_id: &str| {
            if let Some(cb) = ALERT_CLICK_CB.get() {
                let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(alert_id));
            }
        }))))
        // Site click callback
        .insert_resource(SiteClickNotifier(Some(Box::new(|site_id: &str| {
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
        // Default Bevy plugins
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                canvas: Some("#nexrad-bevy-canvas".to_string()),
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
        .run();
}

// ── Callbacks ───────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn set_state_callback(cb: js_sys::Function) {
    STATE_CB.set(cb).ok();
}

#[wasm_bindgen]
pub fn set_alert_click_callback(cb: js_sys::Function) {
    ALERT_CLICK_CB.set(cb).ok();
}

#[wasm_bindgen]
pub fn set_site_click_callback(cb: js_sys::Function) {
    SITE_CLICK_CB.set(cb).ok();
}

// ── Command routing ─────────────────────────────────────────────────────────

/// Send a command to the renderer. `json` is a JSON-serialized command.
/// Commands are routed to the appropriate plugin based on the `type` field.
#[wasm_bindgen]
pub fn send_command(json: &str) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else { return };

    // Try engine commands first
    if let Some(cmd) = EngineCommand::from_json(&v) {
        if let Some(tx) = ENGINE_CMD_TX.get() {
            let _ = tx.try_send(cmd);
        }
        return;
    }

    // Try radar-l2 commands
    if let Some(cmd) = RadarL2Command::from_json(&v) {
        if let Some(tx) = RADAR_CMD_TX.get() {
            let _ = tx.try_send(cmd);
        }
        return;
    }

    // Try alert commands
    if let Some(cmd) = AlertCommand::from_json(&v) {
        if let Some(tx) = ALERT_CMD_TX.get() {
            let _ = tx.try_send(cmd);
        }
        return;
    }

    // Try radar sites commands
    if let Some(cmd) = RadarSitesCommand::from_json(&v) {
        if let Some(tx) = SITES_CMD_TX.get() {
            let _ = tx.try_send(cmd);
        }
        return;
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

fn elevation_to_frame(elev: &nexrad_core::types::ElevationScan) -> AnimationFrame {
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
        let mut files = nexrad_fetch::list_radar_files(&site, &date)
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

/// Fetch and parse one animation frame for `layer_id`, storing it in the internal
/// frame cache. Call `apply_frame` to display it. JS tracks which frames are ready.
#[wasm_bindgen]
pub fn load_frame(layer_id: String, key: String) -> js_sys::Promise {
    future_to_promise(async move {
        let bytes = nexrad_fetch::fetch_radar_file(&key)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        let volume = nexrad_core::parser::parse_volume(&key, bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        if volume.elevations.is_empty() {
            return Err(JsValue::from_str("no elevation scans in volume"));
        }

        let frame = elevation_to_frame(&volume.elevations[0]);
        store_frame(&layer_id, &key, frame);

        Ok(JsValue::UNDEFINED)
    })
}

/// Fetch, parse, and apply the initial radar frame for `layer_id`.
/// Stores the frame in cache, writes to the animation slot, and sends the
/// RadarVolume to the renderer to create the 3D mesh.
#[wasm_bindgen]
pub fn load_initial_frame(layer_id: String, key: String, site_id: String) -> js_sys::Promise {
    future_to_promise(async move {
        let bytes = nexrad_fetch::fetch_radar_file(&key)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        let mut volume = nexrad_core::parser::parse_volume(&site_id, bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        if volume.elevations.is_empty() {
            return Err(JsValue::from_str("no elevation scans in volume"));
        }

        let elev = volume.elevations.remove(0);
        let frame = elevation_to_frame(&elev);

        // Store in cache and apply immediately
        store_frame(&layer_id, &key, frame.clone());
        if let Some(slots) = ANIM_SLOTS.get() {
            let slot = slots.slot_for(&layer_id);
            if let Ok(mut g) = slot.write() {
                *g = Some(frame);
            }
        }

        // Send volume to renderer (creates 3D mesh)
        let radar_volume = RadarVolume {
            site: site_id.clone(),
            elevations: vec![elev],
        };
        let tagged = TaggedVolume {
            layer_id: layer_id.clone(),
            volume: radar_volume,
        };
        if let Some(tx) = VOLUME_TX.get() {
            let _ = tx.try_send(tagged);
        }

        Ok(JsValue::UNDEFINED)
    })
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
