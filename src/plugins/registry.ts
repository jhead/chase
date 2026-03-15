import type { ComponentType } from "react";
import type { NexradWasm } from "../ctx/WasmContext";

// ── Base types ───────────────────────────────────────────────────────────────

export interface LayerBase {
  id: string;
  kind: string;
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// ── Plugin context ───────────────────────────────────────────────────────────

export interface PluginContext {
  wasm: NexradWasm | null;
  isReady: boolean;
  sendCommand: (cmd: Record<string, unknown>) => void;
  subscribe: (event: string, handler: (data: string) => void) => () => void;
}

// ── Sidebar card props ───────────────────────────────────────────────────────

export interface SidebarCardProps<TLayer extends LayerBase = LayerBase> {
  layer: TLayer;
  canRemove: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateLayer: (updates: Partial<TLayer>) => void;
}

// ── Detail panel props ───────────────────────────────────────────────────────

export interface DetailPanelProps {
  onDismiss: () => void;
}

// ── Plugin definition ────────────────────────────────────────────────────────

export interface PluginDefinition<TLayer extends LayerBase = LayerBase> {
  /** Unique kind string, matches Rust plugin (e.g. "radar-l2", "noaa-alerts") */
  kind: string;
  /** Display name for "Add Layer" menu */
  displayName: string;
  /** Factory for creating a new layer with defaults */
  createDefaultLayer: (id: string) => TLayer;
  /** React component for the sidebar card */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SidebarCard: ComponentType<SidebarCardProps<any>>;
  /** Optional: detail panel rendered below sidebar when this plugin is active */
  DetailPanel?: ComponentType<DetailPanelProps>;
  /** Optional: hook that runs per-layer in HUD for side effects */
  useLayerEffect?: (layer: TLayer, ctx: PluginContext) => void;
  /** Singleton = only one instance allowed (e.g. radar-sites, basemap) */
  singleton?: boolean;
  /** Default enabled on fresh app load */
  defaultEnabled?: boolean;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const plugins: Map<string, PluginDefinition> = new Map();

export function registerPlugin<TLayer extends LayerBase>(def: PluginDefinition<TLayer>) {
  plugins.set(def.kind, def as unknown as PluginDefinition);
}

export function getPlugin(kind: string): PluginDefinition | undefined {
  return plugins.get(kind);
}

export function getPlugins(): PluginDefinition[] {
  return Array.from(plugins.values());
}
