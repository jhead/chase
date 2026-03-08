import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { RadarSite } from "../ChaserMap";
import { useWasm } from "../../ctx/WasmContext";

type RadarProps = {
  radarSite: RadarSite | null;
};

export const Radar: React.FC<RadarProps> = ({ radarSite }) => {
  const { loadVolume } = useWasm();
  const lastSiteRef = useRef<string | null>(null);

  useEffect(() => {
    if (!radarSite?.id) return;
    if (lastSiteRef.current === radarSite.id) return;
    lastSiteRef.current = radarSite.id;
    loadVolume(radarSite.id);
  }, [radarSite?.id]);

  return (
    <Container>
      {!radarSite && (
        <Placeholder>Select a radar site on the map</Placeholder>
      )}
    </Container>
  );
};

const Container = styled.div`
  width: 100%;
  height: 50%;
  position: relative;
  overflow: hidden;
  background: #000;
`;

const Placeholder = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 14px;
  pointer-events: none;
`;
