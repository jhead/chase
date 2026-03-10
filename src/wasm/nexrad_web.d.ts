/* tslint:disable */
/* eslint-disable */

/**
 * Append one elevation scan. Data is row-major: reflectivity[ray * num_gates + gate].
 * Call from JS after fetching/parsing a sweep (e.g. via nexrad-level-2-data).
 */
export function add_scan(elevation_angle_deg: number, gate_size_m: number, first_gate_m: number, azimuths: Float32Array, reflectivity: Float32Array): void;

/**
 * Send the accumulated scans as one volume and clear the buffer.
 * Call from JS after all add_scan() calls for the current volume.
 */
export function commit_volume(site_id: string): void;

export function run(): void;

/**
 * Send a command to the Bevy renderer. `json` is a JSON-serialized JsCommand discriminated union.
 * Example: `{"type":"SetRenderMode","mode":"isosurface"}`
 */
export function send_command(json: string): void;

/**
 * Register a JS callback to receive UiState updates from Bevy.
 * Called once after WASM init. The callback receives a JSON string matching UiState.
 */
export function set_state_callback(cb: Function): void;

/**
 * Update the base elevation (tilt 0) texture in-place for animation.
 * `data` is pre-quantized R8Unorm (0-255). Called from JS on each animation frame.
 */
export function update_base_texture(num_rays: number, num_gates: number, data: Uint8Array): void;
