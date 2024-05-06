import Hls from "hls.js";
import React, { VideoHTMLAttributes, useEffect, useRef, useState } from "react";

export type VideoPlayerProps = {
  src: string;
} & VideoHTMLAttributes<HTMLVideoElement>;

const defaultVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  controls: false,
  autoPlay: false,
  disablePictureInPicture: true,
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, ...props }) => {
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      initVideoSource(src, videoRef.current, () => {
        setAttempt((att) => att + 1);
      });
    }
  }, [src, attempt]);

  return <video ref={videoRef} {...props} {...defaultVideoProps}></video>;
};

const initVideoSource = (
  source: string,
  videoElement: HTMLVideoElement,
  onDestroy: () => void
) => {
  if (!Hls.isSupported()) {
    if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
      videoElement.src = source;
      videoElement.addEventListener("loadedmetadata", () => {
        videoElement.play();
      });
    }

    return;
  }
  const hls = new Hls();

  hls.loadSource(source);
  hls.attachMedia(videoElement);

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    videoElement.play();
  });

  hls.on(Hls.Events.ERROR, (event, data) => {
    console.log("hls error", event, data.fatal, data.type);
    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError();
          break;
        default:
          hls.destroy();
          setTimeout(() => onDestroy(), 1000);
          break;
      }
    }
  });
};
