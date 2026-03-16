/* tslint:disable */
/* eslint-disable */

/**
 * Fetch an S3 key, decompress, and parse — returns postcard-encoded `RadarVolume` bytes.
 * The caller transfers the returned `Uint8Array` to the main WASM thread via `postMessage`.
 */
export function fetch_and_parse(key: string, site_id: string): Promise<any>;

export function init(): void;
