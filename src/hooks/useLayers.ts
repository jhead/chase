import { useState, useCallback } from "react";
import type { LayerBase } from "../plugins/registry";
import { getPlugin, getPlugins } from "../plugins/registry";

// ── ID generation ────────────────────────────────────────────────────────────

let _nextId = 1;
function uid(kind: string) {
  return `${kind}-${_nextId++}`;
}

// ── Build default layers from registry ───────────────────────────────────────

function buildDefaultLayers(): LayerBase[] {
  const layers: LayerBase[] = [];
  for (const plugin of getPlugins()) {
    if (plugin.defaultEnabled) {
      const id = plugin.singleton ? plugin.kind : uid(plugin.kind);
      layers.push(plugin.createDefaultLayer(id));
    }
  }
  return layers;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseLayers {
  layers: LayerBase[];
  addLayer: (kind: string) => string;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerBase>) => void;
}

export function useLayers(): UseLayers {
  const [layers, setLayers] = useState<LayerBase[]>(() => buildDefaultLayers());

  const addLayer = useCallback((kind: string): string => {
    const plugin = getPlugin(kind);
    if (!plugin) {
      console.warn(`[useLayers] Unknown plugin kind: ${kind}`);
      return "";
    }
    const id = plugin.singleton ? kind : uid(kind);
    const layer = plugin.createDefaultLayer(id);
    layer.enabled = true;
    setLayers((prev) => {
      if (plugin.singleton && prev.some((l) => l.kind === kind)) return prev;
      return [...prev, layer];
    });
    return id;
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateLayer = useCallback((id: string, updates: Partial<LayerBase>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  }, []);

  return { layers, addLayer, removeLayer, updateLayer };
}
