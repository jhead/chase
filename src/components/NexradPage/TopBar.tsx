import styled from "@emotion/styled";
import {
  ChevronsLeft,
  ChevronLeft,
  Play,
  Pause,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { useWasm } from "../../ctx/WasmContext";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useMultiLayerAnimation";
import { DateTimePicker } from "./DateTimePicker";

interface TopBarProps {
  onSiteClick: () => void;
  animation: AnimationState;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onCycleSpeed: () => void;
  endTime: Date;
  liveMode: boolean;
  onEndTimeChange: (d: Date) => void;
  onGoLive: () => void;
}

function formatUtcTime(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${min} UTC`;
}

export function TopBar({
  onSiteClick,
  animation,
  onTogglePlay,
  onStepBack,
  onStepForward,
  onSeekStart,
  onSeekEnd,
  onCycleSpeed,
  endTime,
  liveMode,
  onEndTimeChange,
  onGoLive,
}: TopBarProps) {
  const { uiState } = useWasm();
  const { active_site } = uiState;
  const { playing, playbackTimeMs, speed, ready } = animation;

  const enabled = ready;
  const timeLabel = ready ? formatUtcTime(playbackTimeMs) : "—";

  return (
    <Bar>
      <Left>
        <SiteButton onClick={onSiteClick} title="Select radar site">
          {active_site ?? "Select Site"}
        </SiteButton>
      </Left>

      <Center>
        <AnimBtn title="Seek to start" disabled={!enabled} onClick={onSeekStart}>
          <ChevronsLeft size={13} strokeWidth={1.5} />
        </AnimBtn>
        <AnimBtn title="Previous frame" disabled={!enabled} onClick={onStepBack}>
          <ChevronLeft size={13} strokeWidth={1.5} />
        </AnimBtn>
        <AnimBtn title="Play / Pause" disabled={!enabled} onClick={onTogglePlay}>
          {playing ? (
            <Pause size={13} strokeWidth={1.5} />
          ) : (
            <Play size={13} strokeWidth={1.5} />
          )}
        </AnimBtn>
        <AnimBtn title="Next frame" disabled={!enabled} onClick={onStepForward}>
          <ChevronRight size={13} strokeWidth={1.5} />
        </AnimBtn>
        <AnimBtn title="Seek to end" disabled={!enabled} onClick={onSeekEnd}>
          <ChevronsRight size={13} strokeWidth={1.5} />
        </AnimBtn>
        <SpeedLabel
          onClick={enabled ? onCycleSpeed : undefined}
          style={{ cursor: enabled ? "pointer" : "default" }}
          title="Cycle speed"
        >
          {speed}×
        </SpeedLabel>
        <TimeLabel>{timeLabel}</TimeLabel>
      </Center>

      <Right>
        <DateTimePicker
          endTime={endTime}
          liveMode={liveMode}
          onCommit={onEndTimeChange}
          onGoLive={onGoLive}
        />
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
  padding: 4px 5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
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

const TimeLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textSecondary};
  padding: 0 4px;
  min-width: 72px;
`;
