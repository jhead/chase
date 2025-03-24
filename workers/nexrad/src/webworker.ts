/// <reference lib="webworker" />
import RadarService from "./service";
import { NOAA_LEVEL2_BUCKET } from "./service";

type Message = {
  radarName: string;
  date: string;
  frameIndex: number;
};

declare const self: Worker;
const ctx: Worker = self;

ctx.onmessage = (e: MessageEvent) => {
  console.log("Worker received message:", e.data);
  const { radarName, date, frameIndex } = JSON.parse(
    e.data as string
  ) as Message;

  const service = new RadarService(NOAA_LEVEL2_BUCKET);

  service
    .getRadialData(date, radarName, frameIndex)
    .then((data) => {
      console.log("Worker got data:", data);
      ctx.postMessage(JSON.stringify(data));
    })
    .catch((error) => {
      console.error("Worker error:", error);
      ctx.postMessage(JSON.stringify({ error: error.message }));
    });
};
