import { useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useRadarAnimation";

interface ScrubBarProps {
  state: AnimationState;
  onSeek: (index: number) => void;
}

/** Return the loaded frame index closest to rawIndex, or null if none. */
function nearestLoadedIndex(
  loadedFrames: Set<number>,
  rawIndex: number
): number | null {
  if (loadedFrames.size === 0) return null;
  const sorted = [...loadedFrames].sort((a, b) => a - b);
  let best = sorted[0];
  let bestDist = Math.abs(sorted[0] - rawIndex);
  for (const i of sorted) {
    const d = Math.abs(i - rawIndex);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function ScrubBar({ state, onSeek }: ScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const { frameCount, frameIndex, loadedFrames, timestamps } = state;

  const indexFromX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || frameCount === 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (frameCount - 1));
    },
    [frameCount]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (frameCount === 0) return;
      const raw = indexFromX(e.clientX);
      const target = nearestLoadedIndex(loadedFrames, raw);
      if (target !== null) {
        onSeek(target);
      }
      setDragging(true);
      trackRef.current?.setPointerCapture(e.pointerId);
    },
    [frameCount, indexFromX, loadedFrames, onSeek]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const raw = indexFromX(e.clientX);
      setHoverIndex(raw);
      if (dragging) {
        const target = nearestLoadedIndex(loadedFrames, raw);
        if (target !== null) onSeek(target);
      }
    },
    [dragging, indexFromX, loadedFrames, onSeek]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    trackRef.current?.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    setHoverIndex(null);
    trackRef.current?.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  if (frameCount === 0) return null;

  const denom = Math.max(1, frameCount - 1);

  return (
    <Track
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {/* Ghost ticks for full timeline length */}
      {frameCount > 1 &&
        Array.from({ length: frameCount }, (_, i) => (
          <GhostTick
            key={i}
            style={{
              left: `${(i / denom) * 100}%`,
            }}
          />
        ))}

      {/* Loaded frame pills */}
      {Array.from(loadedFrames).map((idx) => {
        const leftPct = (idx / denom) * 100;
        const isCurrent = idx === frameIndex;
        return (
          <FramePill
            key={idx}
            style={{ left: `${leftPct}%` }}
            isCurrent={isCurrent}
          />
        );
      })}

      {/* Hover tooltip */}
      {hoverIndex !== null && timestamps[hoverIndex] !== undefined && (
        <Tooltip
          style={{
            left: `${(hoverIndex / denom) * 100}%`,
          }}
        >
          {timestamps[hoverIndex]}
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
  background: ${theme.border};
  opacity: 0.5;
  pointer-events: none;
`;

const FramePill = styled.div<{ isCurrent: boolean }>`
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%)
    ${({ isCurrent }) => (isCurrent ? "scale(1.15)" : "scale(1)")};
  width: 8px;
  height: 12px;
  border-radius: 4px;
  background: ${theme.accent};
  opacity: ${({ isCurrent }) => (isCurrent ? 1 : 0.45)};
  pointer-events: none;
  transition: opacity 0.1s ease, transform 0.1s ease;
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
