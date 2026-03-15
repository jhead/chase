import styled from "@emotion/styled";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useRadarAnimation";

interface TopBarProps {
  onSiteClick: () => void;
  animation: AnimationState;
  onTogglePlay: () => void;
  onPrevFrame: () => void;
  onNextFrame: () => void;
  onSeekFirst: () => void;
  onSeekLast: () => void;
  onCycleSpeed: () => void;
}

export function TopBar({
  onSiteClick,
  animation,
  onTogglePlay,
  onPrevFrame,
  onNextFrame,
  onSeekFirst,
  onSeekLast,
  onCycleSpeed,
}: TopBarProps) {
  const { uiState } = useWasm();
  const { radar_loaded, active_site } = uiState;
  const { playing, frameIndex, frameCount, speed, timestamps, ready } = animation;

  const loadingText = radar_loaded ? "Ready" : "Loading...";
  const loadingColor = radar_loaded ? "#4caf7d" : theme.textDim;

  const enabled = ready && radar_loaded;
  const frameLabel =
    frameCount > 0
      ? `${frameIndex + 1} / ${frameCount}`
      : "—";
  const timeLabel = timestamps[frameIndex] ?? "";

  return (
    <Bar>
      <Left>
        <SiteButton onClick={onSiteClick} title="Select radar site">
          {active_site ?? "Select Site"}
        </SiteButton>
      </Left>

      <Center>
        <AnimBtn title="First frame" disabled={!enabled} onClick={onSeekFirst}>
          {"⏮"}
        </AnimBtn>
        <AnimBtn title="Previous frame" disabled={!enabled} onClick={onPrevFrame}>
          {"⏪"}
        </AnimBtn>
        <AnimBtn title="Play / Pause" disabled={!enabled} onClick={onTogglePlay}>
          {playing ? "⏸" : "▶"}
        </AnimBtn>
        <AnimBtn title="Next frame" disabled={!enabled} onClick={onNextFrame}>
          {"⏩"}
        </AnimBtn>
        <AnimBtn title="Last frame" disabled={!enabled} onClick={onSeekLast}>
          {"⏭"}
        </AnimBtn>
        <SpeedLabel
          onClick={enabled ? onCycleSpeed : undefined}
          style={{ cursor: enabled ? "pointer" : "default" }}
          title="Cycle speed"
        >
          {speed}×
        </SpeedLabel>
        <FrameLabel>
          {frameLabel}
          {timeLabel ? ` · ${timeLabel}` : ""}
        </FrameLabel>
      </Center>

      <Right>
        <StatusDot style={{ color: loadingColor }}>●</StatusDot>
        <StatusText>{loadingText}</StatusText>
      </Right>
    </Bar>
  );
}

const Bar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border-bottom: 1px solid ${theme.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  pointer-events: all;
  z-index: 2;
`;

const Left = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
`;

const Center = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
  justify-content: flex-end;
`;

const SiteButton = styled.button`
  background: none;
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontMono};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: ${theme.accent};
    background: ${theme.bgActive};
  }
`;

const AnimBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.textSecondary};
  font-size: 11px;
  padding: 4px 5px;
  cursor: pointer;
  transition: color 0.15s, opacity 0.15s;

  &:hover:not(:disabled) {
    color: ${theme.textPrimary};
  }

  &:disabled {
    color: ${theme.textDim};
    cursor: default;
    opacity: 0.5;
  }
`;

const SpeedLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textSecondary};
  padding: 0 6px;

  &:hover {
    color: ${theme.textPrimary};
  }
`;

const FrameLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textSecondary};
`;

const StatusDot = styled.span`
  font-size: 8px;
`;

const StatusText = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textSecondary};
`;
