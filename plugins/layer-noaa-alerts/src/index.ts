import { useEffect } from "react";
import { registerPlugin } from "../../../src/plugins/registry";
import type { PluginContext } from "../../../src/plugins/registry";
import { AlertsLayerCard } from "./AlertsLayerCard";
import { AlertDetailPanel } from "./AlertDetailPanel";
import { useAlertsData } from "./useAlertsData";
import { setAlertsData, setActiveAlertId } from "./alertsStore";
import type { AlertsLayer } from "./types";

function useAlertsLayerEffect(layer: AlertsLayer, ctx: PluginContext) {
  const { alertsData } = useAlertsData(layer.enabled ? layer : undefined);

  // Update the shared store with fetched data
  useEffect(() => {
    setAlertsData(layer.id, alertsData);
  }, [alertsData, layer.id]);

  // Sync alerts to Bevy
  useEffect(() => {
    if (!ctx.isReady) return;
    if (!layer.enabled) {
      ctx.sendCommand({ type: "ClearAlerts", layer_id: layer.id });
      return;
    }
    const payloads = alertsData.map((a) => ({
      id: a.id,
      coordinates: a.coordinates[0] ?? [],
      color: a.color,
    }));
    ctx.sendCommand({ type: "SetAlerts", layer_id: layer.id, alerts: payloads });
  }, [alertsData, layer.enabled, layer.id, ctx]);

  // Subscribe to alert click events from Bevy
  useEffect(() => {
    return ctx.subscribe("alert_click", (alertId: string) => {
      setActiveAlertId(alertId);
    });
  }, [ctx]);
}

registerPlugin<AlertsLayer>({
  kind: "noaa-alerts",
  displayName: "NWS Alerts",
  createDefaultLayer: (id) => ({
    id,
    kind: "noaa-alerts",
    enabled: false,
    phenomena: [],
    significance: ["W", "A"],
  }),
  SidebarCard: AlertsLayerCard,
  DetailPanel: AlertDetailPanel,
  useLayerEffect: useAlertsLayerEffect,
  defaultEnabled: true,
});

export type { AlertsLayer } from "./types";
export type { AlertFeature } from "./useAlertsData";
