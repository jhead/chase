import { registerPlugin } from "../../../src/plugins/registry";
import { RadarLayerCard } from "./RadarLayerCard";
import type { RadarLayer } from "./types";

registerPlugin<RadarLayer>({
  kind: "radar-l2",
  displayName: "Radar",
  createDefaultLayer: (id) => ({
    id,
    kind: "radar-l2",
    enabled: true,
    siteId: null,
    product: "REF",
  }),
  SidebarCard: RadarLayerCard,
  defaultEnabled: true,
});

export type { RadarLayer, Product } from "./types";
