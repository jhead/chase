import React from "react";
import { registerPlugin } from "../../../src/plugins/registry";
import { useWasm } from "../../../src/ctx/WasmContext";
import { LayerCard } from "../../../src/components/NexradPage/LayerCard";
import type { SitesLayer } from "./types";
import type { SidebarCardProps } from "../../../src/plugins/registry";

function RadarSitesCard({ layer, canRemove, onToggle, onRemove }: SidebarCardProps<SitesLayer>) {
  const { sendCommand } = useWasm();

  function handleToggle() {
    const visible = !layer.enabled;
    sendCommand({ type: "SetLayerVisible", layer_id: layer.id, visible });
    onToggle();
  }

  function handleRemove() {
    sendCommand({ type: "SetLayerVisible", layer_id: layer.id, visible: false });
    onRemove();
  }

  return React.createElement(LayerCard, {
    label: "Radar Sites",
    enabled: layer.enabled,
    onToggle: handleToggle,
    onRemove: canRemove ? handleRemove : undefined,
  });
}

registerPlugin<SitesLayer>({
  kind: "radar-sites",
  displayName: "Radar Sites",
  createDefaultLayer: (id) => ({ id, kind: "radar-sites", enabled: true }),
  SidebarCard: RadarSitesCard,
  singleton: true,
  defaultEnabled: true,
});

export type { SitesLayer } from "./types";
