import styled from "@emotion/styled";
import { NWS_COLORS, theme } from "./theme";

const TICK_DBZ = [75, 70, 60, 50, 40, 30, 20, 10];

function getColorForDbz(dbz: number): string {
  const sorted = [...NWS_COLORS].sort((a, b) => a.dbz - b.dbz);
  let best = sorted[0];
  for (const entry of sorted) {
    if (entry.dbz <= dbz) best = entry;
    else break;
  }
  return best.color;
}

export function ReflectivityLegend() {
  return (
    <Container>
      <DbzLabel>dBZ</DbzLabel>
      {TICK_DBZ.map((dbz) => (
        <Block key={dbz} style={{ background: getColorForDbz(dbz) }}>
          <BlockLabel>{dbz}</BlockLabel>
        </Block>
      ))}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  pointer-events: none;
`;

const DbzLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 8px;
  color: ${theme.textDim};
  margin-bottom: 2px;
  text-align: center;
`;

const Block = styled.div`
  width: 20px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 2px;
`;

const BlockLabel = styled.span`
  font-family: ${theme.fontMono};
  font-size: 7px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  line-height: 1;
`;
