/* tslint:disable */
/* eslint-disable */

/**
 * Append one elevation scan to the pending buffer for the given layer.
 */
export function add_scan(layer_id: string, elevation_angle_deg: number, gate_size_m: number, first_gate_m: number, azimuths: Float32Array, reflectivity: Float32Array): void;

/**
 * Send the accumulated scans for `layer_id` as one tagged volume, then clear the buffer.
 */
export function commit_volume(layer_id: string, site_id: string): void;

export function run(): void;

/**
 * Send a command to the renderer. `json` is a JSON-serialized command.
 * Commands are routed to the appropriate plugin based on the `type` field.
 */
export function send_command(json: string): void;

export function set_alert_click_callback(cb: Function): void;

export function set_site_click_callback(cb: Function): void;

export function set_state_callback(cb: Function): void;

/**
 * Update the base elevation texture for a specific layer (for animation playback).
 */
export function update_layer_texture(layer_id: string, num_rays: number, num_gates: number, data: Uint8Array): void;
