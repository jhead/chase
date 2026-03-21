import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { theme } from "./theme";

interface DateTimePickerProps {
  endTime: Date;
  onCommit: (d: Date) => void;
}

function toDateTimeLocalUTC(d: Date): string {
  const utcMs = d.getTime() - d.getTimezoneOffset() * 60_000;
  return new Date(utcMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalUTC(val: string): Date {
  const localMs = new Date(val).getTime();
  const offset = new Date().getTimezoneOffset() * 60_000;
  return new Date(localMs + offset);
}

export function DateTimePicker({ endTime, onCommit }: DateTimePickerProps) {
  const [draft, setDraft] = useState(() => toDateTimeLocalUTC(endTime));

  const prevEndTime = useRef(endTime);
  useEffect(() => {
    if (prevEndTime.current !== endTime) {
      prevEndTime.current = endTime;
      setDraft(toDateTimeLocalUTC(endTime));
    }
  }, [endTime]);

  function commit(val: string) {
    const parsed = fromDateTimeLocalUTC(val);
    if (!Number.isNaN(parsed.getTime())) {
      const now = new Date();
      onCommit(parsed > now ? now : parsed);
    }
  }

  return (
    <Wrapper>
      <Icon className="material-symbols-outlined">event</Icon>
      <Input
        type="datetime-local"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
      />
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Icon = styled.span`
  font-size: 16px;
  color: ${theme.textDim};
  line-height: 1;
  user-select: none;
`;

const Input = styled.input`
  background: none;
  border: 1px solid ${theme.border};
  border-radius: ${theme.radius};
  color: ${theme.textPrimary};
  font-family: ${theme.fontMono};
  font-size: 11px;
  padding: 3px 6px;
  cursor: pointer;
  outline: none;
  color-scheme: dark;
  transition: border-color 0.15s;

  &:hover,
  &:focus {
    border-color: ${theme.accent};
  }
`;
