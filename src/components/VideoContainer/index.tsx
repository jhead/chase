import styled from "@emotion/styled";
import React from "react";
import { Chaser } from "../../services/chasers";
import { VideoPlayer } from "../VideoPlayer/index.tsx";
import { PropsOf } from "@emotion/react";

const Container = styled.div`
  position: relative;
  // max-height: 125px;
  overflow: hidden;
`;

const VideoOverlay = styled.span`
  position: absolute;
  color: white;
  font-size: 10px;
  text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000,
    1px 1px 0 #000;
`;

const NameOverlay = styled(VideoOverlay)`
  top: 5px;
  left: 5px;
`;

const LocationOverlay = styled(VideoOverlay)`
  bottom: 5px;
  right: 5px;
`;

const ViewersOverlay = styled(VideoOverlay)`
  bottom: 5px;
  left: 5px;
`;

const OfflineMessage = styled.div`
  background: #333;
  color: white;
  width: 100%;
  height: 125px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export type VideoContainerProps = {
  chaser: Chaser;
} & PropsOf<typeof Container>;

export const VideoContainer: React.FC<VideoContainerProps> = ({
  chaser,
  ...extraProps
}) => {
  const loc = chaser.properties.location;

  const streamOrEmpty = chaser.properties.stream_status ? (
    <VideoPlayer
      muted={true}
      width={"100%"}
      key={chaser.properties.id}
      src={`https://edge.livestormchasing.com/hls/${chaser.properties.stream_id}/index.m3u8`}
    />
  ) : (
    <OfflineMessage>No Signal</OfflineMessage>
  );

  const viewersOrEmpty =
    chaser.properties.viewers > 0 ? (
      <ViewersOverlay>{`${chaser.properties.viewers}`} Viewers</ViewersOverlay>
    ) : null;

  return (
    <Container {...extraProps}>
      {streamOrEmpty}
      <NameOverlay>{`${chaser.properties.name}`}</NameOverlay>
      {viewersOrEmpty}
      <LocationOverlay>{`${loc}`}</LocationOverlay>
    </Container>
  );
};
