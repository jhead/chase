import RadarService from "./service";

type Message = {
  radarName: string;
  date: string;
  frameIndex: number;
};

onmessage = (e) => {
  const { radarName, date, frameIndex } = JSON.parse(e.data) as Message;

  const service = new RadarService(
    "http://localhost:8787/s3/noaa-nexrad-level2"
  );

  service.getRadialData(date, radarName, frameIndex).then((data) => {
    postMessage(JSON.stringify(data));
  });
};
