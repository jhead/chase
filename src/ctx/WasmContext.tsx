import React, { createContext, useContext, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NexradWasm {
  add_scan: (
    elevation_angle_deg: number,
    gate_size_m: number,
    first_gate_m: number,
    azimuths: Float32Array,
    reflectivity: Float32Array
  ) => void;
  commit_volume: (site_id: string) => void;
  send_command: (json: string) => void;
  set_state_callback: (cb: (stateJson: string) => void) => void;
}

/** Discriminated union of all commands JS can send to the Bevy renderer. */
export type JsCommand =
  | { type: "SetRenderMode"; mode: "sweeps" | "isosurface" | "combined" }
  | { type: "ResetCamera" }
  | { type: "SetElevationIndex"; index: number }
  | { type: "SetPaneLayout"; layout: "single" | "split-h" | "split-v" | "quad" };

/** Serializable state pushed from Bevy to React on meaningful changes. */
export interface UiState {
  radar_loaded: boolean;
  iso_loaded: boolean;
  render_mode: "sweeps" | "isosurface" | "combined";
  active_site: string | null;
}

const DEFAULT_UI_STATE: UiState = {
  radar_loaded: false,
  iso_loaded: false,
  render_mode: "sweeps",
  active_site: null,
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

const NEXRAD_API =
  (import.meta as { env?: { VITE_NEXRAD_API_URL?: string } }).env?.VITE_NEXRAD_API_URL ??
  "http://localhost:8787";

function todayPath(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface WasmContextValue {
  wasm: NexradWasm | null;
  isReady: boolean;
  uiState: UiState;
  sendCommand: (cmd: JsCommand) => void;
  loadVolume: (siteId: string) => Promise<void>;
}

const WasmContext = createContext<WasmContextValue>({
  wasm: null,
  isReady: false,
  uiState: DEFAULT_UI_STATE,
  sendCommand: () => {},
  loadVolume: async () => {},
});

export function useWasm() {
  return useContext(WasmContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function WasmProvider({ children }: { children: React.ReactNode }) {
  const [wasm, setWasm] = useState<NexradWasm | null>(null);
  const [uiState, setUiState] = useState<UiState>(DEFAULT_UI_STATE);
  const lastSiteRef = useRef<string | null>(null);

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
        setWasm(mod);
      })
      .catch((err) => console.error("[WasmContext] WASM failed to load:", err));
  }, []);

  function sendCommand(cmd: JsCommand) {
    wasmModule?.send_command(JSON.stringify(cmd));
  }

  async function loadVolume(siteId: string) {
    if (lastSiteRef.current === siteId) return;
    lastSiteRef.current = siteId;

    const mod = await loadWasm();
    const date = todayPath();
    const url = `${NEXRAD_API}?volume=1&date=${encodeURIComponent(date)}&radar=${encodeURIComponent(siteId)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Volume fetch failed: ${res.status}`);
      const data = await res.json() as {
        error?: string;
        site?: string;
        sweeps?: Array<{
          elevation_angle: number;
          gate_size_m: number;
          first_gate_m: number;
          azimuths: number[];
          reflectivity: number[];
        }>;
      };
      if (data.error) throw new Error(data.error);
      const sweeps = data.sweeps ?? [];
      if (sweeps.length === 0) return;

      for (const s of sweeps) {
        mod.add_scan(
          s.elevation_angle,
          s.gate_size_m,
          s.first_gate_m,
          new Float32Array(s.azimuths),
          new Float32Array(s.reflectivity)
        );
      }
      mod.commit_volume(data.site ?? siteId);
    } catch (err) {
      lastSiteRef.current = null; // allow retry
      console.error("[WasmContext] Volume load failed:", err);
    }
  }

  return (
    <WasmContext.Provider
      value={{ wasm, isReady: wasm !== null, uiState, sendCommand, loadVolume }}
    >
      {children}
    </WasmContext.Provider>
  );
}
