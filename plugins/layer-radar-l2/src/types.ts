import type { LayerBase } from "../../../src/plugins/registry";

export type Product = "REF" | "VEL" | "CC" | "ZDR";

export interface RadarLayer extends LayerBase {
  kind: "radar-l2";
  siteId: string | null;
  product: Product;
}
