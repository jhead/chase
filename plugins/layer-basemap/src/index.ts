import React from "react";
import { registerPlugin } from "../../../src/plugins/registry";
import { useWasm } from "../../../src/ctx/WasmContext";
import { LayerCard } from "../../../src/components/NexradPage/LayerCard";
import type { BasemapLayer } from "./types";
import type { SidebarCardProps } from "../../../src/plugins/registry";

function BasemapCard({ layer, onToggle }: SidebarCardProps<BasemapLayer>) {
  const { sendCommand } = useWasm();

  function handleToggle() {
    const visible = !layer.enabled;
    sendCommand({ type: "SetLayerVisible", layer_id: layer.id, visible });
    onToggle();
  }

  return React.createElement(LayerCard, { label: "Basemap", enabled: layer.enabled, onToggle: handleToggle });
}

registerPlugin<BasemapLayer>({
  kind: "basemap",
  displayName: "Basemap",
  createDefaultLayer: (id) => ({ id, kind: "basemap", enabled: true }),
  SidebarCard: BasemapCard,
  singleton: true,
  defaultEnabled: true,
});

export type { BasemapLayer } from "./types";
