import type { LayerBase } from "../../../src/plugins/registry";

export interface AlertsLayer extends LayerBase {
  kind: "noaa-alerts";
  /** NWS phenomena codes to show (e.g. "TO", "SV", "WS"). Empty = show all. */
  phenomena: string[];
  /** NWS significance codes: W=warning, A=watch, Y=advisory, S=statement. Empty = show all. */
  significance: string[];
}
