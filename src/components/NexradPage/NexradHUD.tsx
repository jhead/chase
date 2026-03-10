import styled from "@emotion/styled";
import { useState } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { CanvasButtons } from "./CanvasButtons";
import { ReflectivityLegend } from "./ReflectivityLegend";
import { ScrubBar } from "./ScrubBar";
import { useRadarAnimation } from "../../hooks/useRadarAnimation";

export function NexradHUD() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  void sidebarOpen; // used via Sidebar's own collapsed state for now

  const anim = useRadarAnimation();

  return (
    <Root>
      {/* Top bar spans full width */}
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

      {/* Below top bar: sidebar + canvas area */}
      <Body>
        <Sidebar
          animationState={anim.state}
          onSetSpeed={anim.setSpeed}
          onToggleLoop={anim.toggleLoop}
          onSelectSite={anim.init}
        />
        <CanvasArea>
          {/* Blender-style corner buttons */}
          <CanvasButtons />
          {/* Scrub bar overlaid above scale */}
          <ScrubBarWrap>
            <ScrubBar state={anim.state} onSeek={anim.seekTo} />
          </ScrubBarWrap>
          {/* Color legend pinned to canvas bottom */}
          <ReflectivityLegend />
        </CanvasArea>
      </Body>
    </Root>
  );
}

/** Full-screen overlay. pointer-events:none so Bevy gets mouse/scroll on the canvas. */
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
  margin-top: 36px; /* height of TopBar */
`;

const CanvasArea = styled.div`
  flex: 1;
  position: relative;
`;

/** Positions scrub bar above ReflectivityLegend (32px). Enables pointer-events for interaction. */
const ScrubBarWrap = styled.div`
  position: absolute;
  bottom: 32px;
  left: 0;
  right: 0;
  pointer-events: all;
`;
