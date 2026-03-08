import styled from "@emotion/styled";
import { useState } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { CanvasButtons } from "./CanvasButtons";
import { ReflectivityLegend } from "./ReflectivityLegend";

export function NexradHUD() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  void sidebarOpen; // used via Sidebar's own collapsed state for now

  return (
    <Root>
      {/* Top bar spans full width */}
      <TopBar onSiteClick={() => setSidebarOpen((v) => !v)} />

      {/* Below top bar: sidebar + canvas area */}
      <Body>
        <Sidebar />
        <CanvasArea>
          {/* Blender-style corner buttons */}
          <CanvasButtons />
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
