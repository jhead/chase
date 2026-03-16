use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Fetch an S3 key, decompress, and parse — returns postcard-encoded `RadarVolume` bytes.
/// The caller transfers the returned `Uint8Array` to the main WASM thread via `postMessage`.
#[wasm_bindgen]
pub fn fetch_and_parse(key: String, site_id: String) -> js_sys::Promise {
    future_to_promise(async move {
        let bytes = nexrad_fetch::fetch_radar_file(&key)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        let volume = nexrad_core::parser::parse_volume(&site_id, bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        let encoded = postcard::to_allocvec(&volume)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        Ok(js_sys::Uint8Array::from(encoded.as_slice()).into())
    })
}
