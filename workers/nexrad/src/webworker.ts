/// <reference lib="webworker" />
import RadarService from "./service";
import { NOAA_LEVEL2_BUCKET } from "./service";

type RadialMessage = {
  radarName: string;
  date: string;
  frameIndex: number;
  baseUrl?: string;
};

type VolumeMessage = {
  type: "volume";
  radarName: string;
  date: string;
  baseUrl?: string;
};

declare const self: Worker;
const ctx: Worker = self;

ctx.onmessage = (e: MessageEvent) => {
  const payload = JSON.parse(e.data as string);

  if (payload.type === "volume") {
    const { radarName, date, baseUrl } = payload as VolumeMessage;
    const service = new RadarService(NOAA_LEVEL2_BUCKET, undefined, baseUrl);
    service
      .getVolumeData(date, radarName)
      .then((data) => ctx.postMessage(JSON.stringify(data)))
      .catch((err) =>
        ctx.postMessage(JSON.stringify({ error: String(err?.message ?? err) }))
      );
    return;
  }

  const { radarName, date, frameIndex, baseUrl } = payload as RadialMessage;
  const service = new RadarService(NOAA_LEVEL2_BUCKET, undefined, baseUrl);
  service
    .getRadialData(date, radarName, frameIndex)
    .then((data) => ctx.postMessage(JSON.stringify(data)))
    .catch((error) => {
      console.error("Worker error:", error);
      ctx.postMessage(JSON.stringify({ error: error.message }));
    });
};
