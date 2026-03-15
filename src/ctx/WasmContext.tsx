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
  set_state_callback: (cb: (stateJson: string) => void) => void;
  set_alert_click_callback: (cb: (alertId: string) => void) => void;
  set_site_click_callback: (cb: (siteId: string) => void) => void;
  update_layer_texture: (layer_id: string, num_rays: number, num_gates: number, data: Uint8Array) => void;
}

/** Per-layer state snapshot pushed from Bevy. */
export interface UiRadarLayerState {
  layer_id: string;
  site: string | null;
  elevation_count: number;
  elevation_total: number;
  threshold_dbz: number;
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

  loadPromise = import("../wasm/nexrad_web.js")
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
        mod.set_state_callback((stateJson: string) => {
          try {
            setUiState(JSON.parse(stateJson) as UiState);
          } catch {
            console.error("[WasmContext] Failed to parse UiState:", stateJson);
          }
        });
        mod.set_alert_click_callback((alertId: string) => {
          subscribersRef.current.get("alert_click")?.forEach((h) => h(alertId));
        });
        mod.set_site_click_callback((siteId: string) => {
          subscribersRef.current.get("site_click")?.forEach((h) => h(siteId));
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
