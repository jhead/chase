import { useState, useCallback } from "react";

// ── Layer types ───────────────────────────────────────────────────────────────

export type Product = "REF" | "VEL" | "CC" | "ZDR";
export type LayerKind = "radar" | "nws-alerts";

export interface RadarLayer {
  id: string;
  kind: "radar";
  enabled: boolean;
  siteId: string | null;
  product: Product;
}

export interface AlertsLayer {
  id: string;
  kind: "nws-alerts";
  enabled: boolean;
  /** NWS phenomena codes to show (e.g. "TO", "SV", "WS"). Empty = show all. */
  phenomena: string[];
  /** NWS significance codes: W=warning, A=watch, Y=advisory, S=statement. Empty = show all. */
  significance: string[];
}

export type Layer = RadarLayer | AlertsLayer;

// ── Hook ─────────────────────────────────────────────────────────────────────

let _nextId = 2; // starts at 2 since "radar-1" / "alerts-1" are used by DEFAULT_LAYERS
function uid(kind: LayerKind) {
  return `${kind}-${_nextId++}`;
}

const DEFAULT_LAYERS: Layer[] = [
  { id: "radar-1", kind: "radar", enabled: true, siteId: null, product: "REF" },
  { id: "alerts-1", kind: "nws-alerts", enabled: false, phenomena: [], significance: ["W", "A"] },
];

export interface UseLayers {
  layers: Layer[];
  addLayer: (kind: LayerKind) => void;
  removeLayer: (id: string) => void;
  updateLayer: <T extends Layer>(id: string, updates: Partial<T>) => void;
}

export function useLayers(): UseLayers {
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);

  const addLayer = useCallback((kind: LayerKind) => {
    const id = uid(kind);
    const base = { id, enabled: true };
    const layer: Layer = kind === "radar"
      ? { ...base, kind: "radar", siteId: null, product: "REF" }
      : { ...base, kind: "nws-alerts", phenomena: [], significance: ["W", "A"] };
    setLayers((prev) => [...prev, layer]);
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateLayer = useCallback(<T extends Layer>(id: string, updates: Partial<T>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? ({ ...l, ...updates } as Layer) : l))
    );
  }, []);

  return { layers, addLayer, removeLayer, updateLayer };
}
