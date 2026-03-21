import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Clock } from "lucide-react";
import { theme } from "./theme";

interface DateTimePickerProps {
  endTime: Date;
  liveMode: boolean;
  onCommit: (d: Date) => void;
  onGoLive: () => void;
}

function toUtcDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toUtcTimeString(d: Date): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

export function DateTimePicker({ endTime, liveMode, onCommit, onGoLive }: DateTimePickerProps) {
  const [dateVal, setDateVal] = useState(() => toUtcDateString(endTime));
  const [timeVal, setTimeVal] = useState(() => toUtcTimeString(endTime));

  // Sync inputs when endTime changes externally (e.g. "Go Live" resets to now)
  const prevEndTime = useRef(endTime);
  useEffect(() => {
    if (prevEndTime.current !== endTime) {
      prevEndTime.current = endTime;
      setDateVal(toUtcDateString(endTime));
      setTimeVal(toUtcTimeString(endTime));
    }
  }, [endTime]);

  function commit() {
    const iso = `${dateVal}T${timeVal}:00Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      // Clamp future times to now
      const now = new Date();
      onCommit(parsed > now ? now : parsed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
  }

  return (
    <Container>
      <LiveBtn
        title="Go to live / current time"
        isLive={liveMode}
        onClick={onGoLive}
      >
        <Clock size={12} strokeWidth={1.5} />
        <span>Live</span>
      </LiveBtn>
      <DateInput
        type="date"
        value={dateVal}
        onChange={(e) => setDateVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        title="UTC date"
      />
      <TimeInput
        type="time"
        value={timeVal}
        onChange={(e) => setTimeVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        title="UTC time"
      />
      <UtcLabel>UTC</UtcLabel>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const LiveBtn = styled.button<{ isLive: boolean }>`
  display: flex;
  align-items: center;
  gap: 3px;
  background: ${({ isLive }) => (isLive ? theme.bgActive : "none")};
  border: 1px solid ${({ isLive }) => (isLive ? theme.accent : theme.border)};
  border-radius: ${theme.radius};
  color: ${({ isLive }) => (isLive ? theme.accent : theme.textSecondary)};
  font-family: ${theme.fontMono};
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;

  &:hover {
    border-color: ${theme.accentHover};
    color: ${theme.accentHover};
    background: ${theme.bgActive};
  }
`;

const baseInput = `
  background: none;
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontMono};
  font-size: 11px;
  padding: 2px 5px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
  color-scheme: dark;

  &:hover,
  &:focus {
    border-color: ${theme.accent};
  }
`;

const DateInput = styled.input`
  ${baseInput}
  width: 110px;
`;

const TimeInput = styled.input`
  ${baseInput}
  width: 72px;
`;

const UtcLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.textDim};
`;
