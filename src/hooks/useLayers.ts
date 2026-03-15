import { useState, useCallback } from "react";

// ── Layer types ───────────────────────────────────────────────────────────────

export type Product = "REF" | "VEL" | "CC" | "ZDR";
export type LayerKind = "radar" | "nws-alerts" | "radar-sites";

export interface RadarLayer {
  id: string;
  kind: "radar";
  enabled: boolean;
  siteId: string | null;
  product: Product;
}

export interface SitesLayer {
  id: string;
  kind: "radar-sites";
  enabled: boolean;
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

export type Layer = RadarLayer | AlertsLayer | SitesLayer;

// ── Hook ─────────────────────────────────────────────────────────────────────

let _nextId = 2; // starts at 2 since "radar-1" / "alerts-1" are used by DEFAULT_LAYERS
function uid(kind: LayerKind) {
  return `${kind}-${_nextId++}`;
}

const DEFAULT_LAYERS: Layer[] = [
  { id: "radar-sites", kind: "radar-sites", enabled: true },
  { id: "radar-1", kind: "radar", enabled: true, siteId: null, product: "REF" },
  { id: "alerts-1", kind: "nws-alerts", enabled: false, phenomena: [], significance: ["W", "A"] },
];

export interface UseLayers {
  layers: Layer[];
  addLayer: (kind: LayerKind) => void;
  /** Add a new radar layer, optionally pre-selecting a site. Returns the new layer id. */
  addRadarLayer: (siteId?: string) => string;
  removeLayer: (id: string) => void;
  updateLayer: <T extends Layer>(id: string, updates: Partial<T>) => void;
}

export function useLayers(): UseLayers {
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);

  const addLayer = useCallback((kind: LayerKind) => {
    const id =
      kind === "radar-sites" ? "radar-sites" : uid(kind);
    const base = { id, enabled: true };
    const layer: Layer =
      kind === "radar"
        ? { ...base, kind: "radar", siteId: null, product: "REF" }
        : kind === "radar-sites"
          ? { ...base, kind: "radar-sites" }
          : { ...base, kind: "nws-alerts", phenomena: [], significance: ["W", "A"] };
    setLayers((prev) => {
      if (kind === "radar-sites" && prev.some((l) => l.id === "radar-sites")) return prev;
      return [...prev, layer];
    });
  }, []);

  const addRadarLayer = useCallback((siteId?: string): string => {
    const id = uid("radar");
    const layer: RadarLayer = {
      id,
      kind: "radar",
      enabled: true,
      siteId: siteId ?? null,
      product: "REF",
    };
    setLayers((prev) => [...prev, layer]);
    return id;
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateLayer = useCallback(<T extends Layer>(id: string, updates: Partial<T>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? ({ ...l, ...updates } as Layer) : l))
    );
  }, []);

  return { layers, addLayer, addRadarLayer, removeLayer, updateLayer };
}
