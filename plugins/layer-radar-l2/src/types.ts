import type { LayerBase } from "../../../src/plugins/registry";

export type Product = "REF" | "VEL" | "SW" | "ZDR" | "CC" | "PHIDP";

/** Maps Product UI ID → snake_case moment name sent to Bevy. */
export const PRODUCT_MOMENT: Record<Product, string> = {
  REF: "reflectivity",
  VEL: "velocity",
  SW: "spectrum_width",
  ZDR: "differential_reflectivity",
  CC: "correlation_coefficient",
  PHIDP: "differential_phase",
};

export interface RadarLayer extends LayerBase {
  kind: "radar-l2";
  siteId: string | null;
  product: Product;
}
