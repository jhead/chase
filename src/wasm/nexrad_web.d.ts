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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly run: () => void;
    readonly add_scan: (a: number, b: number, c: number, d: any, e: any) => void;
    readonly commit_volume: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__hd95243468a9866b9: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h1a31c4847aef9ae6: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__hff55d557e3b804a4: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__hac2841a984129126: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__hfab123a86d4f0f1f: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a_3: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a_4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a_5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a_6: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a_7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a_8: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ac90ce3abcc1d7a_9: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h16d257ee81f60245: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h7f43fce922608972: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__ha14b060a65b7aff5: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
