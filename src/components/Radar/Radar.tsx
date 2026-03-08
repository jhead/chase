import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { RadarSite } from "../ChaserMap";

const NEXRAD_API =
  import.meta.env.VITE_NEXRAD_API_URL ?? "http://localhost:8787";

// ── WASM module singleton ─────────────────────────────────────────────────────
// Bevy's winit event loop cannot be stopped and restarted, so we keep the
// module reference alive for the lifetime of the page.  Component remounts
// just re-attach to the existing canvas and push volume via add_scan/commit_volume.

interface NexradWasm {
  add_scan: (
    elevation_angle_deg: number,
    gate_size_m: number,
    first_gate_m: number,
    azimuths: Float32Array,
    reflectivity: Float32Array
  ) => void;
  commit_volume: (site_id: string) => void;
}

let wasmModule: NexradWasm | null = null;

let loadPromise: Promise<NexradWasm> | null = null;

function loadWasm(): Promise<NexradWasm> {
  if (loadPromise) return loadPromise;

  loadPromise = import("../../wasm/nexrad_web.js")
    .then(async (mod) => {
      // wasm-bindgen --target web requires calling the default export (init)
      // to fetch + instantiate the .wasm binary before any exports work.
      // The #[wasm_bindgen(start)] fn (run) is called automatically inside init,
      // which starts Bevy's event loop.
      await (mod.default as () => Promise<void>)();
      wasmModule = mod as unknown as NexradWasm;
      return wasmModule;
    })
    .catch((err) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

/** Format YYYY/MM/DD for NEXRAD API (today). */
function todayPath(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

type RadarProps = {
  radarSite: RadarSite | null;
};

/** Fixed canvas ID that nexrad-web's Bevy app attaches to via `Window::canvas`. */
const CANVAS_ID = "nexrad-bevy-canvas";

export const Radar: React.FC<RadarProps> = ({ radarSite }) => {
  // Track the last site we told Bevy about so we don't duplicate requests.
  const lastSiteRef = useRef<string | null>(null);

  // Pre-load the WASM module as soon as this component first mounts,
  // regardless of whether a site has been selected yet.
  useEffect(() => {
    loadWasm().catch((err) =>
      console.error("[Radar] WASM failed to load:", err)
    );
  }, []);

  // When a site is selected, fetch volume from API and push to Bevy via add_scan/commit_volume.
  useEffect(() => {
    if (!radarSite?.id) return;
    if (lastSiteRef.current === radarSite.id) return;

    lastSiteRef.current = radarSite.id;

    const date = todayPath();
    const url = `${NEXRAD_API}?volume=1&date=${encodeURIComponent(date)}&radar=${encodeURIComponent(radarSite.id)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Volume fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { error?: string; site?: string; sweeps?: Array<{
        elevation_angle: number;
        gate_size_m: number;
        first_gate_m: number;
        azimuths: number[];
        reflectivity: number[];
      }> }) => {
        if (data.error) throw new Error(data.error);
        const sweeps = data.sweeps ?? [];
        if (sweeps.length === 0) return;

        return loadWasm().then((wasm) => {
          for (const s of sweeps) {
            wasm.add_scan(
              s.elevation_angle,
              s.gate_size_m,
              s.first_gate_m,
              new Float32Array(s.azimuths),
              new Float32Array(s.reflectivity)
            );
          }
          wasm.commit_volume(data.site ?? radarSite.id);
        });
      })
      .catch((err) =>
        console.error("[Radar] Volume load failed:", err)
      );
  }, [radarSite?.id]);

  return (
    <Container>
      {/* Bevy attaches to this canvas via `Window { canvas: Some("#nexrad-bevy-canvas") }`.
          Keep it in the DOM permanently — Bevy's event loop cannot be restarted. */}
      <BevyCanvas id={CANVAS_ID} />
      {!radarSite && (
        <Placeholder>Select a radar site on the map</Placeholder>
      )}
    </Container>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const Container = styled.div`
  width: 100%;
  height: 50%;
  position: relative;
  overflow: hidden;
  background: #000;
`;

const BevyCanvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
  /* Prevent Bevy's canvas from stealing keyboard focus from the rest of the UI */
  outline: none;
`;

const Placeholder = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 14px;
  pointer-events: none;
`;
