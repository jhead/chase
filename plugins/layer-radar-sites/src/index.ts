import React, { useEffect, useRef } from "react";
import { registerPlugin } from "../../../src/plugins/registry";
import { useWasm } from "../../../src/ctx/WasmContext";
import { LayerCard } from "../../../src/components/NexradPage/LayerCard";
import type { SitesLayer } from "./types";
import type { SidebarCardProps, PluginContext } from "../../../src/plugins/registry";

const IEM_NEXRAD_CSV =
  "https://mesonet.agron.iastate.edu/sites/networks.php?network=NEXRAD&format=csv&nohtml=on";

/** Convert IEM 3-letter NWS code → 4-letter ICAO. Returns null to skip. */
function iemToIcao(stid: string, lat: number, lon: number): string | null {
  // Skip overseas military with no NOAA public archive
  if (stid === "ODN" || stid === "KJK" || stid === "KSG") return null;
  if (stid === "JUA") return "TJUA"; // Puerto Rico
  if (stid === "GUA") return "PGUA"; // Guam
  // Alaska: lon < -130, lat > 50
  if (lon < -130 && lat > 50) return "P" + stid;
  // Hawaii: roughly 18–24°N, 162–154°W
  if (lat > 18 && lat < 24 && lon > -163 && lon < -154) return "P" + stid;
  return "K" + stid;
}

function parseIemCsv(csv: string): Array<{ id: string; lat: number; lng: number }> {
  const sites: Array<{ id: string; lat: number; lng: number }> = [];
  for (const line of csv.split("\n")) {
    if (!line || line.startsWith("#") || line.startsWith("stid")) continue;
    const cols = line.split(",");
    if (cols.length < 4) continue;
    const stid = cols[0].trim();
    const lat = parseFloat(cols[2]);
    const lon = parseFloat(cols[3]);
    if (!stid || isNaN(lat) || isNaN(lon)) continue;
    const id = iemToIcao(stid, lat, lon);
    if (id) sites.push({ id, lat, lng: lon });
  }
  return sites;
}

function useRadarSitesEffect(_layer: SitesLayer, ctx: PluginContext) {
  const { isReady, sendCommand } = ctx;
  const sentRef = useRef(false);
  useEffect(() => {
    if (!isReady || sentRef.current) return;
    sentRef.current = true;
    fetch(IEM_NEXRAD_CSV)
      .then((res) => res.text())
      .then((csv) => {
        const sites = parseIemCsv(csv);
        sendCommand({ type: "SetRadarSites", sites });
        console.log(`[radar-sites] loaded ${sites.length} sites from IEM`);
      })
      .catch((err) => console.error("[radar-sites] failed to fetch IEM sites:", err));
  }, [isReady]);
}

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
  useLayerEffect: useRadarSitesEffect,
  singleton: true,
  defaultEnabled: true,
});

export type { SitesLayer } from "./types";
