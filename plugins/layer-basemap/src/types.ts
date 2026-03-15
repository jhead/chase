import type { LayerBase } from "../../../src/plugins/registry";

export interface BasemapLayer extends LayerBase {
  kind: "basemap";
}
