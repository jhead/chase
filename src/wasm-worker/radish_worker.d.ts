/* tslint:disable */
/* eslint-disable */

/**
 * Fetch an S3 key, decompress, and parse — returns postcard-encoded `RadarVolume` bytes.
 * The caller transfers the returned `Uint8Array` to the main WASM thread via `postMessage`.
 */
export function fetch_and_parse(key: string, site_id: string): Promise<any>;

export function init(): void;

/**
 * Start streaming live radar data for a site. Polls the real-time chunks bucket,
 * assembles each chunk into a volume, and invokes `on_scan` with postcard-encoded
 * `RadarVolume` bytes whenever a new tilt is available.
 *
 * The loop runs until `should_stop()` returns a truthy value.
 *
 * Call this from JS via `spawn_local`; it never resolves while streaming.
 */
export function start_live_stream(site: string, tilt_index: number, on_scan: Function, layer_id: string, should_stop: Function): void;
