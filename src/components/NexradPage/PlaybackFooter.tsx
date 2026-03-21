import styled from "@emotion/styled";
import { theme } from "./theme";
import type { AnimationState } from "../../hooks/useMultiLayerAnimation";
import { DateTimePicker } from "./DateTimePicker";
import { ScrubBar } from "./ScrubBar";

interface PlaybackFooterProps {
  animation: AnimationState;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onSetSpeed: (speed: number) => void;
  onSeek: (timeMs: number) => void;
  endTime: Date;
  liveMode: boolean;
  onEndTimeChange: (d: Date) => void;
  onGoLive: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4];

export function PlaybackFooter({
  animation,
  onTogglePlay,
  onSeekStart,
  onSeekEnd,
  onSetSpeed,
  onSeek,
  endTime,
  liveMode,
  onEndTimeChange,
  onGoLive,
}: PlaybackFooterProps) {
  const { playing, speed, ready, windowStartMs, windowEndMs, playbackTimeMs, allTimestampsMs, loadedTimestampsMs } = animation;

  return (
    <Footer>
      <TransportGroup>
        <IconBtn title="Seek to start" disabled={!ready} onClick={onSeekStart}>
          <MSIcon>skip_previous</MSIcon>
        </IconBtn>
        <PlayBtn title={playing ? "Pause" : "Play"} disabled={!ready} onClick={onTogglePlay}>
          <MSIcon fill>{playing ? "pause" : "play_arrow"}</MSIcon>
        </PlayBtn>
        <IconBtn title="Seek to end" disabled={!ready} onClick={onSeekEnd}>
          <MSIcon>skip_next</MSIcon>
        </IconBtn>
      </TransportGroup>

      <DateTimePicker endTime={endTime} onCommit={onEndTimeChange} />

      <ScrubWrap>
        <ScrubBar
          windowStartMs={windowStartMs}
          windowEndMs={windowEndMs}
          playbackTimeMs={playbackTimeMs}
          allTimestampsMs={allTimestampsMs}
          loadedTimestampsMs={loadedTimestampsMs}
          onSeek={onSeek}
        />
      </ScrubWrap>

      <SpeedGroup>
        {SPEED_OPTIONS.map((s) => (
          <SpeedBtn key={s} active={speed === s} onClick={() => onSetSpeed(s)}>
            {s}x
          </SpeedBtn>
        ))}
      </SpeedGroup>

      <LiveBtn isLive={liveMode} onClick={onGoLive} title="Go to live / current time">
        <MSIcon pulse={liveMode}>sensors</MSIcon>
        LIVE
      </LiveBtn>
    </Footer>
  );
}

const Footer = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border-top: 1px solid ${theme.border};
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  z-index: 50;
  pointer-events: all;
`;

const TransportGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
`;

const IconBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.textSecondary};
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;

  &:hover:not(:disabled) {
    color: ${theme.textPrimary};
  }

  &:disabled {
    color: ${theme.textDim};
    cursor: default;
    opacity: 0.5;
  }
`;

const PlayBtn = styled(IconBtn)`
  width: 32px;
  height: 32px;
  background: ${theme.accent};
  color: #000;
  border-radius: ${theme.radius};

  &:hover:not(:disabled) {
    background: ${theme.accentHover};
    color: #000;
  }

  &:disabled {
    background: ${theme.textDim};
    color: #000;
    opacity: 0.5;
  }
`;

function MSIcon({ children, fill, pulse }: { children: React.ReactNode; fill?: boolean; pulse?: boolean }) {
  return (
    <MSIconSpan fill={fill} pulse={pulse} className="material-symbols-outlined">
      {children}
    </MSIconSpan>
  );
}

const MSIconSpan = styled.span<{ fill?: boolean; pulse?: boolean }>`
  font-size: 20px;
  line-height: 1;
  font-variation-settings: 'FILL' ${({ fill }) => (fill ? 1 : 0)};
  ${({ pulse }) => pulse && `animation: mspulse 1.5s ease-in-out infinite;`}

  @keyframes mspulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

const ScrubWrap = styled.div`
  flex: 1;
  min-width: 0;
`;

const SpeedGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
`;

const SpeedBtn = styled.button<{ active?: boolean }>`
  background: ${({ active }) => (active ? theme.bgActive : "none")};
  border: 1px solid ${({ active }) => (active ? theme.accent : theme.border)};
  border-radius: ${theme.radius};
  color: ${({ active }) => (active ? theme.accent : theme.textSecondary)};
  font-family: ${theme.fontMono};
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;

  &:hover {
    border-color: ${theme.accent};
    color: ${theme.accent};
  }
`;

const LiveBtn = styled.button<{ isLive: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  background: ${({ isLive }) => (isLive ? theme.bgActive : "none")};
  border: 1px solid ${({ isLive }) => (isLive ? theme.accent : theme.border)};
  border-radius: ${theme.radius};
  color: ${({ isLive }) => (isLive ? theme.accent : theme.textSecondary)};
  font-family: ${theme.fontHeadline};
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 4px 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s, color 0.15s, background 0.15s;

  &:hover {
    border-color: ${theme.accent};
    color: ${theme.accent};
    background: ${theme.bgActive};
  }
`;
