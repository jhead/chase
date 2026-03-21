import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NexradWasm {
  add_scan: (
    layer_id: string,
    elevation_angle_deg: number,
    gate_size_m: number,
    first_gate_m: number,
    azimuths: Float32Array,
    reflectivity: Float32Array
  ) => void;
  commit_volume: (layer_id: string, site_id: string) => void;
  send_command: (json: string) => void;
  set_event_callback: (cb: (eventJson: string) => void) => void;
  update_layer_texture: (layer_id: string, num_rays: number, num_gates: number, data: Uint8Array) => void;
  list_radar_frames: (site: string, date: string) => Promise<string>;
  receive_radar_volume: (layer_id: string, key: string, site_id: string, bytes: Uint8Array) => void;
  cache_radar_frame: (layer_id: string, key: string, bytes: Uint8Array) => void;
  apply_frame: (layer_id: string, key: string) => void;
  clear_frame_cache: (layer_id: string) => void;
  apply_live_scan: (layer_id: string, site_id: string, bytes: Uint8Array) => void;
}

/** Per-layer state snapshot pushed from Bevy. */
export interface UiRadarLayerState {
  layer_id: string;
  site: string | null;
  elevation_count: number;
  elevation_total: number;
  threshold_dbz: number;
  range_km: number;
  /** Moment names present in the most recent volume (snake_case). */
  available_moments: string[];
}

/** Serializable state pushed from Bevy to React on meaningful changes. */
export interface UiState {
  radar_loaded: boolean;
  active_site: string | null;
  elevation_count: number;
  elevation_total: number;
  threshold_dbz: number;
  radar_layers: UiRadarLayerState[];
}

const DEFAULT_UI_STATE: UiState = {
  radar_loaded: false,
  active_site: null,
  elevation_count: 0,
  elevation_total: 0,
  threshold_dbz: 10,
  radar_layers: [],
};

// ── WASM singleton ────────────────────────────────────────────────────────────

let wasmModule: NexradWasm | null = null;
let loadPromise: Promise<NexradWasm> | null = null;

function loadWasm(): Promise<NexradWasm> {
  if (loadPromise) return loadPromise;

  loadPromise = import("../wasm/radish_web.js")
    .then((mod) => {
      wasmModule = mod as unknown as NexradWasm;
      return wasmModule;
    })
    .catch((err) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface WasmContextValue {
  wasm: NexradWasm | null;
  isReady: boolean;
  uiState: UiState;
  sendCommand: (cmd: Record<string, unknown>) => void;
  subscribe: (event: string, handler: (data: string) => void) => () => void;
}

const WasmContext = createContext<WasmContextValue>({
  wasm: null,
  isReady: false,
  uiState: DEFAULT_UI_STATE,
  sendCommand: () => {},
  subscribe: () => () => {},
});

export function useWasm() {
  return useContext(WasmContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function WasmProvider({ children }: { children: React.ReactNode }) {
  const [wasm, setWasm] = useState<NexradWasm | null>(null);
  const [uiState, setUiState] = useState<UiState>(DEFAULT_UI_STATE);
  const subscribersRef = useRef(new Map<string, Set<(data: string) => void>>());

  useEffect(() => {
    loadWasm()
      .then((mod) => {
        mod.set_event_callback((eventJson: string) => {
          try {
            const { name, data } = JSON.parse(eventJson);
            if (name === "state_update") {
              try {
                setUiState(JSON.parse(data) as UiState);
              } catch {
                console.error("[WasmContext] Failed to parse UiState data:", data);
              }
            }
            subscribersRef.current.get(name)?.forEach((h) => h(data));
          } catch {
            console.error("[WasmContext] Failed to parse PluginEvent:", eventJson);
          }
        });
        setWasm(mod);
      })
      .catch((err) => console.error("[WasmContext] WASM failed to load:", err));
  }, []);

  const sendCommand = useCallback((cmd: Record<string, unknown>) => {
    wasmModule?.send_command(JSON.stringify(cmd));
  }, []);

  const subscribe = useCallback((event: string, handler: (data: string) => void) => {
    const subs = subscribersRef.current;
    if (!subs.has(event)) subs.set(event, new Set());
    subs.get(event)!.add(handler);
    return () => {
      subs.get(event)?.delete(handler);
    };
  }, []);

  return (
    <WasmContext.Provider
      value={{
        wasm,
        isReady: wasm !== null,
        uiState,
        sendCommand,
        subscribe,
      }}
    >
      {children}
    </WasmContext.Provider>
  );
}
