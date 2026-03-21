import { useEffect, useRef } from "react";
import { registerPlugin } from "../../../src/plugins/registry";
import type { PluginContext } from "../../../src/plugins/registry";
import { startLiveStream, stopLiveStream } from "../../../src/workers/radarWorkerClient";
import { LiveRadarLayerCard, liveStreamStatus } from "./LiveRadarLayerCard";
import type { LiveRadarLayer } from "./types";

function useLiveRadarEffect(layer: LiveRadarLayer, ctx: PluginContext) {
  const prevRef = useRef<{ site: string | null; tilt: number; enabled: boolean }>({
    site: null,
    tilt: 0,
    enabled: false,
  });

  useEffect(() => {
    const prev = prevRef.current;
    const { siteId, tiltIndex, enabled, id } = layer;

    // If disabled or no site, stop any active stream
    if (!enabled || !siteId) {
      if (prev.enabled && prev.site) {
        stopLiveStream(id);
        ctx.sendCommand({ type: "RemoveLayer", layer_id: id });
      }
      prevRef.current = { site: siteId, tilt: tiltIndex, enabled };
      return;
    }

    // If site, tilt, or enabled state changed, restart the stream
    const changed =
      siteId !== prev.site || tiltIndex !== prev.tilt || (!prev.enabled && enabled);

    if (changed) {
      // Stop old stream if any
      if (prev.site && prev.enabled) {
        stopLiveStream(id);
      }

      // Start new stream
      startLiveStream(
        id,
        siteId,
        tiltIndex,
        (bytes: Uint8Array, nextUpdateMs: number) => {
          ctx.wasm?.apply_live_scan(id, siteId, bytes);
          // Update timing status for the UI
          const now = Date.now();
          liveStreamStatus.set(id, {
            lastUpdateTime: now,
            nextUpdateMs: nextUpdateMs >= 0 ? nextUpdateMs : null,
          });
        },
        () => {
          console.warn(`[LiveRadar] stream error for ${siteId}, layer ${id}`);
        },
      );
    }

    prevRef.current = { site: siteId, tilt: tiltIndex, enabled };

    // Cleanup on unmount
    return () => {
      stopLiveStream(id);
      liveStreamStatus.delete(id);
    };
  }, [layer.siteId, layer.tiltIndex, layer.enabled, layer.id, ctx]);
}

registerPlugin<LiveRadarLayer>({
  kind: "radar-l2-live",
  displayName: "Radar (Live)",
  createDefaultLayer: (id) => ({
    id,
    kind: "radar-l2-live",
    enabled: true,
    siteId: null,
    tiltIndex: 0,
    product: "REF",
  }),
  SidebarCard: LiveRadarLayerCard,
  useLayerEffect: useLiveRadarEffect,
});

export type { LiveRadarLayer, Product } from "./types";
