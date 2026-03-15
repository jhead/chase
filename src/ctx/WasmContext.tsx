import React, { createContext, useContext, useEffect, useState, useRef } from "react";

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

/** Payload for one alert polygon sent to Bevy. */
export interface AlertPolygonPayload {
  id: string;
  coordinates: [number, number][]; // [lng, lat] GeoJSON order
  color: [number, number, number, number]; // RGBA 0–1
}

/** Discriminated union of all commands JS can send to the Bevy renderer. */
export type JsCommand =
  | { type: "ResetCamera" }
  | { type: "RemoveLayer"; layer_id: string }
  | { type: "SetElevationCount"; layer_id: string; count: number }
  | { type: "SetThreshold"; layer_id: string; dbz: number }
  | { type: "SetRangeKm"; layer_id: string; range_km: number }
  | { type: "SetCameraMode"; mode: "2d" | "3d" }
  | { type: "SetAlerts"; layer_id: string; alerts: AlertPolygonPayload[] }
  | { type: "ClearAlerts"; layer_id: string }
  | { type: "SetLayerVisible"; layer_id: string; visible: boolean };

/** Per-layer state snapshot pushed from Bevy. */
export interface UiRadarLayerState {
  layer_id: string;
  site: string | null;
  elevation_count: number;
  elevation_total: number;
  threshold_dbz: number;
  range_km: number;
}

/** Serializable state pushed from Bevy to React on meaningful changes. */
export interface UiState {
  radar_loaded: boolean;
  // Backwards-compat: mirrors primary layer (radar-1)
  active_site: string | null;
  elevation_count: number;
  elevation_total: number;
  threshold_dbz: number;
  // Per-layer state
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
// Bevy's winit event loop cannot be stopped and restarted, so we keep the
// module reference alive for the lifetime of the page.

let wasmModule: NexradWasm | null = null;
let loadPromise: Promise<NexradWasm> | null = null;

function loadWasm(): Promise<NexradWasm> {
  if (loadPromise) return loadPromise;

  loadPromise = import("../wasm/nexrad_web.js")
    .then((mod) => {
      // With --target bundler + vite-plugin-wasm, the WASM is initialized
      // automatically on import and #[wasm_bindgen(start)] runs immediately.
      // No explicit init call needed.
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
  sendCommand: (cmd: JsCommand) => void;
  activeAlertId: string | null;
  dismissAlert: () => void;
}

const WasmContext = createContext<WasmContextValue>({
  wasm: null,
  isReady: false,
  uiState: DEFAULT_UI_STATE,
  sendCommand: () => {},
  activeAlertId: null,
  dismissAlert: () => {},
});

export function useWasm() {
  return useContext(WasmContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function WasmProvider({ children }: { children: React.ReactNode }) {
  const [wasm, setWasm] = useState<NexradWasm | null>(null);
  const [uiState, setUiState] = useState<UiState>(DEFAULT_UI_STATE);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const setActiveAlertIdRef = useRef(setActiveAlertId);
  setActiveAlertIdRef.current = setActiveAlertId;

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
          setActiveAlertIdRef.current(alertId);
        });
        setWasm(mod);
      })
      .catch((err) => console.error("[WasmContext] WASM failed to load:", err));
  }, []);

  function sendCommand(cmd: JsCommand) {
    wasmModule?.send_command(JSON.stringify(cmd));
  }

  function dismissAlert() {
    setActiveAlertId(null);
  }

  return (
    <WasmContext.Provider
      value={{
        wasm,
        isReady: wasm !== null,
        uiState,
        sendCommand,
        activeAlertId,
        dismissAlert,
      }}
    >
      {children}
    </WasmContext.Provider>
  );
}
