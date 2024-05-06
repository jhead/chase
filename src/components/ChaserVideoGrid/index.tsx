import { useContext, useState } from "react";
import { VideoContainer } from "../VideoContainer";
import { ChasersContext } from "../../ctx/ChasersContext";
import styled from "@emotion/styled";
import { Chaser } from "../../services/chasers";

type ChaserVideoGridProps = {
  onSelect: (chaser: Chaser | null) => void;
  onHover: (chaser: Chaser | null) => void;
};

export const ChaserVideoGrid: React.FC<ChaserVideoGridProps> = ({
  onHover,
}) => {
  const { chasers } = useContext(ChasersContext);
  const [selected, setSelected] = useState<string | null>();

  const numChasers = chasers.length;
  const numChasersOnline = chasers.filter(
    (chaser) => chaser.properties.stream_status
  ).length;

  const selectedChaser = chasers.find(
    (chaser) => chaser.properties.id === selected
  );

  const filteredChasers = chasers.filter(
    (chaser) => chaser.properties.id !== selected
  );

  if (selectedChaser) {
    filteredChasers.unshift(selectedChaser);
  }

  return (
    <>
      <div>
        {numChasersOnline} Chasers Streaming ({numChasers} Active)
      </div>
      <GridContainer>
        {filteredChasers.map((chaser) => (
          <GridVideoContainer
            chaser={chaser}
            key={chaser.properties.id}
            className={chaser.properties.id === selected ? `expanded` : ""}
            onClick={() => {
              if (chaser.properties.id === selectedChaser?.properties.id) {
                setSelected(null);
              } else {
                setSelected(chaser.properties.id);
              }
            }}
            onMouseOver={() => (onHover ? onHover(chaser) : null)}
            onMouseLeave={() => (onHover ? onHover(null) : null)}
          />
        ))}
      </GridContainer>
    </>
  );
};

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 250px));
  gap: 0;
  width: 100%;
  padding: 10px;
  justify-content: center;
`;

const GridVideoContainer = styled(VideoContainer)`
  background: #666;
  padding: 0;
  color: white;
  height: 125px;

  transition: all 100ms ease-in-out;

  &:hover,
  &.expanded {
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.35);
    z-index: 1;
  }

  &.expanded {
    width: 100%;
    height: auto;
    grid-column: 1 / -1;
  }
`;
