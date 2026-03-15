import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { useWasm } from "../../ctx/WasmContext";
import { useLayers } from "../../hooks/useLayers";
import { useMultiLayerAnimation } from "../../hooks/useMultiLayerAnimation";
import { getPlugin } from "../../plugins/registry";
import type { LayerBase, PluginContext } from "../../plugins/registry";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { CanvasButtons } from "./CanvasButtons";
import { ReflectivityLegend } from "./ReflectivityLegend";
import { ScrubBar } from "./ScrubBar";

// ── Per-layer effect runner ──────────────────────────────────────────────────

function LayerEffectRunner({ layer, ctx }: { layer: LayerBase; ctx: PluginContext }) {
  const plugin = getPlugin(layer.kind);
  plugin?.useLayerEffect?.(layer, ctx);
  return null;
}

// ── HUD ──────────────────────────────────────────────────────────────────────

export function NexradHUD() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  void sidebarOpen;

  const { wasm, sendCommand, isReady, subscribe } = useWasm();
  const { layers, addLayer, removeLayer, updateLayer } = useLayers();

  // Filter radar layers for animation (need siteId field)
  const radarLayers = layers.filter((l) => l.kind === "radar-l2" && l.siteId) as (LayerBase & { siteId: string })[];
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
        anim.initLayer(layer.id, siteId);
      }
    }
  }, [layers, anim]);

  // Handle site clicks — add a new radar layer for the clicked site.
  // Re-subscribe only when subscribe reference changes (stable), not on every layers change.
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

  return (
    <Root>
      <TopBar
        onSiteClick={() => setSidebarOpen((v) => !v)}
        animation={anim.state}
        onTogglePlay={anim.togglePlay}
        onPrevFrame={anim.prevFrame}
        onNextFrame={anim.nextFrame}
        onSeekFirst={() => anim.seekTo(0)}
        onSeekLast={() => anim.seekTo(anim.state.frameCount - 1)}
        onCycleSpeed={anim.cycleSpeed}
      />

      <Body>
        <Sidebar
          animationState={anim.state}
          onSetSpeed={anim.setSpeed}
          onToggleLoop={anim.toggleLoop}
          layers={layers}
          addLayer={addLayer}
          removeLayer={removeLayer}
          updateLayer={updateLayer}
        />
        <CanvasArea>
          <CanvasButtons />
          <ScrubBarWrap>
            <ScrubBar state={anim.state} onSeek={anim.seekTo} />
          </ScrubBarWrap>
          <ReflectivityLegend />
        </CanvasArea>
      </Body>

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
  flex-direction: column;
`;

const Body = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  margin-top: 36px;
`;

const CanvasArea = styled.div`
  flex: 1;
  position: relative;
`;

const ScrubBarWrap = styled.div`
  position: absolute;
  bottom: 32px;
  left: 0;
  right: 0;
  pointer-events: all;
`;
