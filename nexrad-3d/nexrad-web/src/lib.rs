use async_channel::Sender;
use bevy::prelude::*;
use nexrad_core::types::{ElevationScan, RadarVolume};
use nexrad_render::{ExternalVolumeReceiver, RadarPlugin};
use std::sync::{OnceLock, RwLock};
use wasm_bindgen::prelude::*;

/// Channel from JS into Bevy: volumes sent here are drained each frame by the plugin.
static VOLUME_TX: OnceLock<Sender<RadarVolume>> = OnceLock::new();

/// Scans accumulated by add_scan() until commit_volume() sends them as one volume.
static PENDING_SCANS: OnceLock<RwLock<Vec<ElevationScan>>> = OnceLock::new();

#[wasm_bindgen(start)]
pub fn run() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();

    let (vol_tx, vol_rx) = async_channel::unbounded::<RadarVolume>();
    VOLUME_TX.set(vol_tx).ok();
    PENDING_SCANS.set(RwLock::new(Vec::new())).ok();

    App::new()
        .insert_resource(ExternalVolumeReceiver(vol_rx))
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
