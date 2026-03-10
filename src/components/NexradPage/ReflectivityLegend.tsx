import styled from "@emotion/styled";
import { NWS_COLORS, theme } from "./theme";

const gradient = NWS_COLORS.map(
  ({ color }, i) => `${color} ${(i / (NWS_COLORS.length - 1)) * 100}%`
).join(", ");

const tickDbz = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

export function ReflectivityLegend() {
  const min = NWS_COLORS[0].dbz;
  const max = NWS_COLORS[NWS_COLORS.length - 1].dbz;
  const range = max - min;

  return (
    <Container>
      <Bar style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <Ticks>
        {tickDbz.map((dbz) => (
          <Tick key={dbz} style={{ left: `${((dbz - min) / range) * 100}%` }}>
            <TickLine />
            <TickLabel>{dbz}</TickLabel>
          </Tick>
        ))}
      </Ticks>
      <Unit>dBZ</Unit>
    </Container>
  );
}

const Container = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 32px;
  padding: 0 48px 0 8px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 4px;
`;

const Bar = styled.div`
  height: 10px;
  border-radius: 2px;
  margin-bottom: 2px;
`;

const Ticks = styled.div`
  position: relative;
  height: 14px;
`;

const Tick = styled.div`
  position: absolute;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
`;

const TickLine = styled.div`
  width: 1px;
  height: 3px;
  background: ${theme.textSecondary};
`;

const TickLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 9px;
  color: ${theme.textSecondary};
  line-height: 1;
`;

const Unit = styled.span`
  position: absolute;
  right: 8px;
  bottom: 4px;
  font-family: ${theme.fontMono};
  font-size: 9px;
  color: ${theme.textDim};
`;
