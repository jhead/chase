import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { useWasm } from "../../ctx/WasmContext";
import { useLayers } from "../../hooks/useLayers";
import { useMultiLayerAnimation } from "../../hooks/useMultiLayerAnimation";
import { usePinchZoom } from "../../hooks/usePinchZoom";
import { getPlugin } from "../../plugins/registry";
import type { LayerBase, PluginContext } from "../../plugins/registry";
import { Sidebar } from "./Sidebar";
import { CanvasHUD } from "./CanvasHUD";
import { PlaybackFooter } from "./PlaybackFooter";

// ── Per-layer effect runner ──────────────────────────────────────────────────

function LayerEffectRunner({ layer, ctx }: { layer: LayerBase; ctx: PluginContext }) {
  const plugin = getPlugin(layer.kind);
  plugin?.useLayerEffect?.(layer, ctx);
  return null;
}

// ── HUD ──────────────────────────────────────────────────────────────────────

export function NexradHUD() {
  usePinchZoom();

  const { wasm, sendCommand, isReady, subscribe, uiState } = useWasm();
  const { layers, addLayer, removeLayer, updateLayer } = useLayers();

  // Global time window state
  const [endTime, setEndTime] = useState<Date>(() => new Date());
  const [liveMode, setLiveMode] = useState(true);
  const endTimeRef = useRef(endTime);
  endTimeRef.current = endTime;

  // Filter radar layers for animation (need siteId field)
  const radarLayers = layers.filter((l) => l.kind === "radar-l2" && l.siteId && l.enabled) as (LayerBase & { siteId: string })[];
  const anim = useMultiLayerAnimation(radarLayers);

  // Build plugin context for layer effects
  const pluginCtx: PluginContext = { wasm, isReady, sendCommand, subscribe };

  // Track previous siteId per layer so we only call initLayer on actual changes.
  const prevSiteIdsRef = useRef(new Map<string, string>());

  // Call initLayer when a radar-l2 layer gets a new or changed siteId.
  useEffect(() => {
    for (const layer of layers) {
      if (layer.kind !== "radar-l2") continue;
      const siteId = layer.siteId as string | null;
      const prev = prevSiteIdsRef.current.get(layer.id) ?? null;
      if (siteId && siteId !== prev) {
        prevSiteIdsRef.current.set(layer.id, siteId);
        anim.initLayer(layer.id, siteId, endTimeRef.current);
      }
    }
  }, [layers, anim]);

  function handleEndTimeChange(newEnd: Date) {
    setEndTime(newEnd);
    setLiveMode(false);
    for (const layer of radarLayers) {
      anim.initLayer(layer.id, layer.siteId, newEnd);
    }
  }

  function handleGoLive() {
    const now = new Date();
    setEndTime(now);
    setLiveMode(true);
    for (const layer of radarLayers) {
      anim.initLayer(layer.id, layer.siteId, now);
    }
  }

  // Handle site clicks — add a new radar layer for the clicked site.
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const addLayerRef = useRef(addLayer);
  addLayerRef.current = addLayer;
  const updateLayerRef = useRef(updateLayer);
  updateLayerRef.current = updateLayer;

  useEffect(() => {
    return subscribe("site_click", (siteId: string) => {
      const alreadyActive = layersRef.current.some(
        (l: LayerBase) => l.kind === "radar-l2" && l.siteId === siteId
      );
      if (alreadyActive) return;
      const newId = addLayerRef.current("radar-l2");
      if (newId) {
        updateLayerRef.current(newId, { siteId });
      }
    });
  }, [subscribe]);

  const { windowStartMs, windowEndMs, allTimestampsMs, loadedTimestampsMs } = anim.state;

  return (
    <Root>
      <Sidebar
        animationState={anim.state}
        layers={layers}
        addLayer={addLayer}
        removeLayer={removeLayer}
        updateLayer={updateLayer}
      />

      <RightCol>
        <CanvasArea>
          <CanvasHUD
            radarLayers={uiState.radar_layers}
            loadedTimestampsMs={loadedTimestampsMs}
            allTimestampsMs={allTimestampsMs}
          />
        </CanvasArea>
      </RightCol>

      <PlaybackFooter
        animation={anim.state}
        onTogglePlay={anim.togglePlay}
        onStepBack={anim.stepBack}
        onStepForward={anim.stepForward}
        onSeekStart={() => anim.seekToTime(windowStartMs)}
        onSeekEnd={() => anim.seekToTime(windowEndMs)}
        onSetSpeed={anim.setSpeed}
        onSeek={anim.seekToTime}
        endTime={endTime}
        liveMode={liveMode}
        onEndTimeChange={handleEndTimeChange}
        onGoLive={handleGoLive}
      />

      {/* Run per-layer plugin effects */}
      {layers.map((layer) => (
        <LayerEffectRunner key={layer.id} layer={layer} ctx={pluginCtx} />
      ))}
    </Root>
  );
}

const Root = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  display: flex;
  flex-direction: row;
  overflow: hidden;
`;

const RightCol = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-bottom: 48px;
  min-width: 0;
`;

const CanvasArea = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`;
