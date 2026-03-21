use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = setTimeout)]
    fn set_timeout(closure: &js_sys::Function, millis: i32);
}

/// Async sleep for use in WASM (works in both window and worker contexts).
async fn sleep_ms(ms: i32) {
    let promise = js_sys::Promise::new(&mut |resolve, _| {
        set_timeout(&resolve, ms);
    });
    let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Fetch an S3 key, decompress, and parse — returns postcard-encoded `RadarVolume` bytes.
/// The caller transfers the returned `Uint8Array` to the main WASM thread via `postMessage`.
#[wasm_bindgen]
pub fn fetch_and_parse(key: String, site_id: String) -> js_sys::Promise {
    future_to_promise(async move {
        let bytes = radish_fetch::fetch_radar_file(&key)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        let volume = radish_core::parser::parse_volume(&site_id, bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        let encoded = postcard::to_allocvec(&volume)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        Ok(js_sys::Uint8Array::from(encoded.as_slice()).into())
    })
}

// ── Live streaming ─────────────────────────────────────────────────────────

/// Start streaming live radar data for a site. Polls the real-time chunks bucket,
/// assembles each chunk into a volume, and invokes `on_scan` with postcard-encoded
/// `RadarVolume` bytes whenever a new tilt is available.
///
/// The loop runs until `should_stop()` returns a truthy value.
///
/// Call this from JS via `spawn_local`; it never resolves while streaming.
#[wasm_bindgen]
pub fn start_live_stream(
    site: String,
    tilt_index: u8,
    on_scan: js_sys::Function,
    layer_id: String,
    should_stop: js_sys::Function,
) {
    wasm_bindgen_futures::spawn_local(async move {
        if let Err(e) = run_live_stream(&site, tilt_index, &on_scan, &layer_id, &should_stop).await
        {
            log::error!("live stream error for {site}: {e}");
            // Notify JS of the error
            let _ = on_scan.call2(
                &JsValue::NULL,
                &JsValue::from_str(&layer_id),
                &JsValue::NULL,
            );
        }
    });
}

async fn run_live_stream(
    site: &str,
    tilt_index: u8,
    on_scan: &js_sys::Function,
    layer_id: &str,
    should_stop: &js_sys::Function,
) -> Result<(), String> {
    use nexrad_data::aws::realtime::{
        ChunkIterator, Chunk, ChunkType,
        list_chunks_in_volume, download_chunk,
    };

    log::info!("starting live stream for {site}, tilt {tilt_index}");

    // Initialize the chunk iterator (finds latest volume, downloads initial chunks)
    let init = ChunkIterator::start(site)
        .await
        .map_err(|e| format!("failed to init ChunkIterator: {e}"))?;

    let mut iterator = init.iterator;

    // Get the current volume index from the latest chunk
    let current_volume = *init.latest_chunk.identifier.volume();
    let latest_seq = init.latest_chunk.identifier.sequence();

    // Accumulate chunks for assembly
    let mut chunks: Vec<Chunk<'static>> = Vec::new();

    // Add the start chunk first (if we have it separately)
    if let Some(start_chunk) = init.start_chunk {
        chunks.push(start_chunk.chunk);
    }

    // Backfill: download ALL chunks in the current volume up to the latest one.
    // ChunkIterator::start() only downloads start + latest, so we're missing
    // all the intermediate chunks that make up the full sweep.
    log::info!("backfilling chunks for volume {} (up to seq {latest_seq})", current_volume.as_number());
    let all_chunk_ids = list_chunks_in_volume(site, current_volume, 100)
        .await
        .map_err(|e| format!("failed to list chunks in volume: {e}"))?;

    for chunk_id in &all_chunk_ids {
        // Skip the start chunk (already have it) and the latest (will add after)
        if chunk_id.chunk_type() == ChunkType::Start {
            continue; // Already added from init.start_chunk or init.latest_chunk
        }
        if chunk_id.sequence() >= latest_seq {
            continue; // Will add the latest chunk after
        }

        match download_chunk(site, chunk_id).await {
            Ok((_id, chunk)) => {
                chunks.push(chunk);
            }
            Err(e) => {
                log::warn!("failed to download backfill chunk {}: {e}", chunk_id.name());
            }
        }
    }

    // Add the latest chunk last (already downloaded by ChunkIterator::start)
    chunks.push(init.latest_chunk.chunk);

    log::info!("backfill complete: {} chunks assembled for {site}", chunks.len());

    // Send the initial assembled data
    let next_ms = time_until_next_ms(&iterator);
    send_tilt_if_available(&chunks, site, tilt_index, on_scan, layer_id, next_ms);

    // Main polling loop — fetch new chunks as they arrive
    loop {
        if is_stopped(should_stop) {
            log::info!("live stream stopped for {site}");
            return Ok(());
        }

        // Determine how long to wait before polling
        let wait_ms = iterator
            .time_until_next()
            .map(|d| d.num_milliseconds().max(100) as i32)
            .unwrap_or(2000);

        sleep_ms(wait_ms).await;

        if is_stopped(should_stop) {
            log::info!("live stream stopped for {site}");
            return Ok(());
        }

        // Try to fetch the next chunk
        match iterator.try_next().await {
            Ok(Some(downloaded)) => {
                let is_start = matches!(&downloaded.chunk, Chunk::Start(_));

                // If this is a new volume start, reset accumulated chunks
                if is_start {
                    log::info!("new volume started for {site}, resetting chunks");
                    chunks.clear();
                }

                chunks.push(downloaded.chunk);
                let next_ms = time_until_next_ms(&iterator);
                send_tilt_if_available(&chunks, site, tilt_index, on_scan, layer_id, next_ms);
            }
            Ok(None) => {
                // Chunk not yet available, will retry on next iteration
            }
            Err(e) => {
                log::warn!("chunk fetch error for {site}: {e}, retrying...");
                sleep_ms(3000).await;
            }
        }
    }
}

fn time_until_next_ms(iterator: &nexrad_data::aws::realtime::ChunkIterator) -> i32 {
    iterator
        .time_until_next()
        .map(|d| d.num_milliseconds().max(0) as i32)
        .unwrap_or(-1)
}

fn is_stopped(should_stop: &js_sys::Function) -> bool {
    should_stop
        .call0(&JsValue::NULL)
        .map(|v| v.is_truthy())
        .unwrap_or(false)
}

/// Try to assemble accumulated chunks into a Scan, extract the requested tilt,
/// convert to RadarVolume, and send via callback.
fn send_tilt_if_available(
    chunks: &[nexrad_data::aws::realtime::Chunk<'static>],
    site: &str,
    tilt_index: u8,
    on_scan: &js_sys::Function,
    layer_id: &str,
    next_update_ms: i32,
) {
    use nexrad_data::aws::realtime::assemble_volume;
    use radish_core::parser::sweep_to_elevation_scan;
    use radish_core::types::RadarVolume;

    // Need at least one chunk (the start chunk) to assemble
    if chunks.is_empty() {
        return;
    }

    // Assemble chunks into a nexrad_model Scan
    let scan = match assemble_volume(chunks.iter().cloned()) {
        Ok(scan) => scan,
        Err(e) => {
            log::debug!("assemble_volume incomplete (expected during progressive load): {e}");
            return;
        }
    };

    // Sort sweeps by elevation angle and pick the requested tilt
    let mut sweeps: Vec<_> = scan.sweeps().iter().collect();
    sweeps.sort_by(|a, b| {
        let a_elev = a.radials().first().map(|r| r.elevation_angle_degrees()).unwrap_or(0.0);
        let b_elev = b.radials().first().map(|r| r.elevation_angle_degrees()).unwrap_or(0.0);
        a_elev.partial_cmp(&b_elev).unwrap_or(std::cmp::Ordering::Equal)
    });

    let sweep = match sweeps.get(tilt_index as usize) {
        Some(s) => s,
        None => {
            // Requested tilt not yet available in the data
            return;
        }
    };

    let elevation_scan = match sweep_to_elevation_scan(sweep) {
        Some(scan) => scan,
        None => return,
    };

    let volume = RadarVolume {
        site: site.to_string(),
        elevations: vec![elevation_scan],
    };

    let encoded = match postcard::to_allocvec(&volume) {
        Ok(bytes) => bytes,
        Err(e) => {
            log::error!("postcard encode failed: {e}");
            return;
        }
    };

    let js_bytes = js_sys::Uint8Array::from(encoded.as_slice());
    let _ = on_scan.call3(
        &JsValue::NULL,
        &JsValue::from_str(layer_id),
        &js_bytes,
        &JsValue::from(next_update_ms),
    );
}
