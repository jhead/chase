import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { useWasm } from "../../ctx/WasmContext";
import { useLayers } from "../../hooks/useLayers";
import { useMultiLayerAnimation } from "../../hooks/useMultiLayerAnimation";
import type { RadarLayer } from "../../hooks/useLayers";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { CanvasButtons } from "./CanvasButtons";
import { ReflectivityLegend } from "./ReflectivityLegend";
import { ScrubBar } from "./ScrubBar";

export function NexradHUD() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  void sidebarOpen;

  const { wasm } = useWasm();
  const { layers, addLayer, addRadarLayer, removeLayer, updateLayer } = useLayers();
  const radarLayers = layers.filter((l): l is RadarLayer => l.kind === "radar");

  const anim = useMultiLayerAnimation(radarLayers);

  useEffect(() => {
    if (!wasm) return;
    wasm.set_site_click_callback((siteId: string) => {
      const alreadyActive = radarLayers.some((l) => l.siteId === siteId);
      if (alreadyActive) return;
      const newId = addRadarLayer(siteId);
      anim.initLayer(newId, siteId);
    });
  }, [wasm, radarLayers, addRadarLayer, anim]);

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
          onSelectSite={(layerId, siteId) => anim.initLayer(layerId, siteId)}
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
