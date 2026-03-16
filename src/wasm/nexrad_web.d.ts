/* tslint:disable */
/* eslint-disable */

/**
 * Append one elevation scan to the pending buffer for the given layer.
 */
export function add_scan(layer_id: string, elevation_angle_deg: number, gate_size_m: number, first_gate_m: number, azimuths: Float32Array, reflectivity: Float32Array): void;

/**
 * Apply a previously loaded frame (by S3 key) to the animation slot for `layer_id`.
 * Must be called after `load_frame` or `load_initial_frame` has resolved for this key.
 */
export function apply_frame(layer_id: string, key: string): void;

/**
 * Remove all cached frames for `layer_id` (call when tearing down a layer).
 */
export function clear_frame_cache(layer_id: string): void;

/**
 * Send the accumulated scans for `layer_id` as one tagged volume, then clear the buffer.
 */
export function commit_volume(layer_id: string, site_id: string): void;

/**
 * List available radar frames for `site` on `date` ("YYYY/MM/DD").
 * Returns a JSON string: `{ files: string[], timestamps: string[], count: number }`.
 */
export function list_radar_frames(site: string, date: string): Promise<any>;

/**
 * Fetch and parse one animation frame for `layer_id`, storing it in the internal
 * frame cache. Call `apply_frame` to display it. JS tracks which frames are ready.
 */
export function load_frame(layer_id: string, key: string): Promise<any>;

/**
 * Fetch, parse, and apply the initial radar frame for `layer_id`.
 * Stores the frame in cache, writes to the animation slot, and sends the
 * RadarVolume to the renderer to create the 3D mesh.
 */
export function load_initial_frame(layer_id: string, key: string, site_id: string): Promise<any>;

export function run(): void;

/**
 * Send a command to the renderer. `json` is a JSON-serialized command.
 * Commands are broadcast as `RawCommand` Bevy messages; each plugin
 * parses what it recognizes.
 */
export function send_command(json: string): void;

export function set_event_callback(cb: Function): void;

/**
 * Update the base elevation texture for a specific layer (for animation playback).
 */
export function update_layer_texture(layer_id: string, num_rays: number, num_gates: number, data: Uint8Array): void;
