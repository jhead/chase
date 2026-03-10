import { useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useRadarAnimation";

interface ScrubBarProps {
  state: AnimationState;
  onSeek: (index: number) => void;
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
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const idx = indexFromX(e.clientX);
      onSeek(idx);
    },
    [frameCount, indexFromX, onSeek]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const idx = indexFromX(e.clientX);
      setHoverIndex(idx);
      if (dragging) {
        onSeek(idx);
      }
    },
    [dragging, indexFromX, onSeek]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoverIndex(null);
    setDragging(false);
  }, []);

  if (frameCount === 0) return null;

  const playheadPct = (frameIndex / Math.max(1, frameCount - 1)) * 100;

  return (
    <Track
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {/* Loaded frame segments */}
      <LoadedOverlay>
        {Array.from(loadedFrames).map((idx) => {
          const left = (idx / Math.max(1, frameCount - 1)) * 100;
          const width = (1 / Math.max(1, frameCount - 1)) * 100;
          return (
            <LoadedSegment
              key={idx}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
            />
          );
        })}
      </LoadedOverlay>

      {/* Playhead */}
      <Playhead style={{ left: `${playheadPct}%` }} />

      {/* Hover tooltip */}
      {hoverIndex !== null && timestamps[hoverIndex] && (
        <Tooltip
          style={{
            left: `${(hoverIndex / Math.max(1, frameCount - 1)) * 100}%`,
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

const LoadedOverlay = styled.div`
  position: absolute;
  inset: 0;
`;

const LoadedSegment = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  background: ${theme.accent};
  opacity: 0.6;
`;

const Playhead = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  transform: translateX(-1px);
  pointer-events: none;
  z-index: 1;
`;

const Tooltip = styled.div`
  position: absolute;
  bottom: 100%;
  transform: translateX(-50%);
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
