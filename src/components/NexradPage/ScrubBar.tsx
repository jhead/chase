import { useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { theme } from "./theme";

interface ScrubBarProps {
  windowStartMs: number;
  windowEndMs: number;
  playbackTimeMs: number;
  /** Union of all layer frame timestamps, sorted ascending. */
  allTimestampsMs: number[];
  /** Timestamps of loaded frames (primary layer). */
  loadedTimestampsMs: Set<number>;
  onSeek: (timeMs: number) => void;
}

function formatUtcHHMM(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${min} UTC`;
}

export function ScrubBar({
  windowStartMs,
  windowEndMs,
  playbackTimeMs,
  allTimestampsMs,
  loadedTimestampsMs,
  onSeek,
}: ScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const span = windowEndMs - windowStartMs;
  const hasData = allTimestampsMs.length > 0 && span > 0;

  const timeFromX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || span <= 0) return windowStartMs;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return windowStartMs + ratio * span;
    },
    [windowStartMs, span]
  );

  const toPct = (ms: number) => ((ms - windowStartMs) / span) * 100;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!hasData) return;
      const t = timeFromX(e.clientX);
      onSeek(t);
      setDragging(true);
      trackRef.current?.setPointerCapture(e.pointerId);
    },
    [hasData, timeFromX, onSeek]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const t = timeFromX(e.clientX);
      setHoverMs(t);
      if (dragging) onSeek(t);
    },
    [dragging, timeFromX, onSeek]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    trackRef.current?.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    setHoverMs(null);
    trackRef.current?.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  if (!hasData) return null;

  const playheadPct = toPct(playbackTimeMs);

  return (
    <Track
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {/* Ghost ticks at every known scan time */}
      {allTimestampsMs.map((ts) => (
        <GhostTick key={ts} style={{ left: `${toPct(ts)}%` }} />
      ))}

      {/* Filled pills for loaded frames */}
      {allTimestampsMs
        .filter((ts) => loadedTimestampsMs.has(ts))
        .map((ts) => (
          <FramePill key={ts} style={{ left: `${toPct(ts)}%` }} />
        ))}

      {/* Playhead cursor */}
      <Playhead style={{ left: `${playheadPct}%` }} />

      {/* Hover tooltip */}
      {hoverMs !== null && (
        <Tooltip style={{ left: `${toPct(hoverMs)}%` }}>
          {formatUtcHHMM(hoverMs)}
        </Tooltip>
      )}
    </Track>
  );
}

const Track = styled.div`
  position: relative;
  width: 100%;
  height: 20px;
  background: ${theme.border};
  cursor: pointer;
  pointer-events: all;
  touch-action: none;
  user-select: none;
`;

const GhostTick = styled.div`
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 1px;
  height: 6px;
  background: ${theme.textDim};
  opacity: 0.6;
  pointer-events: none;
`;

const FramePill = styled.div`
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 10px;
  border-radius: 3px;
  background: ${theme.accent};
  opacity: 0.55;
  pointer-events: none;
`;

const Playhead = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  width: 2px;
  background: ${theme.textPrimary};
  pointer-events: none;
  border-radius: 1px;
`;

const Tooltip = styled.div`
  position: absolute;
  bottom: 100%;
  transform: translateX(-50%);
  margin-bottom: 4px;
  background: ${theme.bg};
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontMono};
  font-size: 10px;
  padding: 2px 5px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
`;
