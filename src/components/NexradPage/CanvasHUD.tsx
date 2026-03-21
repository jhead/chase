import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { theme } from "./theme";
import type { UiRadarLayerState } from "../../ctx/WasmContext";
import { CanvasButtons } from "./CanvasButtons";
import { ReflectivityLegend } from "./ReflectivityLegend";

interface CanvasHUDProps {
  radarLayers: UiRadarLayerState[];
  loadedTimestampsMs: Set<number>;
  allTimestampsMs: number[];
}

function LiveClock() {
  const [utcTime, setUtcTime] = useState(() => formatUtcTime(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setUtcTime(formatUtcTime(Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  return <ClockDisplay>{utcTime} UTC</ClockDisplay>;
}

function formatUtcTime(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const sec = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}:${min}:${sec}`;
}

export function CanvasHUD({ radarLayers, loadedTimestampsMs, allTimestampsMs }: CanvasHUDProps) {
  const primaryLayer = radarLayers.find((l) => l.site !== null) ?? null;

  const buffPct =
    allTimestampsMs.length > 0
      ? Math.round((loadedTimestampsMs.size / allTimestampsMs.length) * 100)
      : null;

  return (
    <Overlay>
      {/* Camera controls rendered with its own absolute positioning */}
      <CanvasButtons />

      {/* Top-right: live clock */}
      <TopRight>
        <LiveClock />
      </TopRight>

      {/* Bottom-left: reflectivity legend */}
      <BottomLeft>
        <ReflectivityLegend />
      </BottomLeft>

      {/* Telemetry strip */}
      {primaryLayer && (
        <TelemetryStrip>
          <TelemetryLeft>
            <TelemetryStat>
              <TelLabel>SWEEP</TelLabel>
              <TelValue>{primaryLayer.elevation_count}.0/{primaryLayer.elevation_total}.0</TelValue>
            </TelemetryStat>
            <TelemetryStat>
              <TelLabel>RANGE</TelLabel>
              <TelValue>{primaryLayer.range_km}KM</TelValue>
            </TelemetryStat>
          </TelemetryLeft>
          <TelemetryRight>
            <TelemetryStat>
              <TelLabel>BUFF</TelLabel>
              <TelValueAccent>{buffPct !== null ? `${buffPct}%` : "—"}</TelValueAccent>
            </TelemetryStat>
          </TelemetryRight>
        </TelemetryStrip>
      )}
    </Overlay>
  );
}

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const TopRight = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
`;

const BottomLeft = styled.div`
  position: absolute;
  bottom: 36px;
  left: 8px;
`;

const TelemetryStrip = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: rgba(11, 13, 18, 0.7);
  border-top: 1px solid ${theme.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
`;

const TelemetryLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const TelemetryRight = styled.div`
  display: flex;
  align-items: center;
`;

const TelemetryStat = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const TelLabel = styled.span`
  font-family: ${theme.fontHeadline};
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: ${theme.textDim};
  text-transform: uppercase;
`;

const TelValue = styled.span`
  font-family: ${theme.fontMono};
  font-size: 10px;
  color: ${theme.textSecondary};
`;

const TelValueAccent = styled(TelValue)`
  color: ${theme.accent};
`;

const ClockDisplay = styled.span`
  font-family: ${theme.fontMono};
  font-size: 11px;
  color: ${theme.textSecondary};
  background: ${theme.bg};
  backdrop-filter: ${theme.blur};
  border: 1px solid ${theme.border};
  padding: 3px 8px;
`;
