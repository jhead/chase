import { useEffect, useRef, useState } from "react";
import RadarCanvas from "./RadarCanvas";
import RadarWebWorker from "../../../workers/nexrad/src/webworker.ts?worker";

type RadarRes = {
  rays: RadarRay[];
  azs: number[];
};

type RadarRay = {
  block_type: string;
  name: string;
  spare: number[];
  gate_count: number;
  first_gate: number;
  gate_size: number;
  rf_threshold: number;
  snr_threshold: number;
  control_flags: number;
  data_size: number;
  scale: number;
  offset: number;
  moment_data: number[];
  azimuth: number;
};

const numRays = 720;
const numGates = 2000;
const radarOptions = {
  numGates,
  numRays,
};

const parseRadarData = (data: RadarRes): number[] => {
  data.rays.sort((a, b) => a.azimuth - b.azimuth);

  const output: number[] = [];
  for (let iRay = 0; iRay < numRays; iRay++) {
    const ray = data.rays[iRay];
    if (!ray) continue;

    for (let iGate = 0; iGate < numGates; iGate++) {
      if (iGate > ray.gate_count) {
        output.push(0);
      } else {
        let gate = ray.moment_data[iGate];
        gate = Math.max(0, gate);
        output.push(gate / 75);
      }
    }
  }

  return output;
};

const getDataOld = async (frame: number): Promise<RadarRes> => {
  return fetch(
    `http://localhost:8787/?date=2024/05/19&radar=KDDC&frame=${frame}`
  )
    .then((res) => res.json())
    .then((res) => JSON.parse(res));
};

const getData = async (frame: number): Promise<RadarRes> => {
  const worker = new RadarWebWorker();

  worker.postMessage(
    JSON.stringify({
      date: "2024/05/19",
      radarName: "KDDC",
      frameIndex: frame,
    })
  );

  return new Promise((resolve, reject) => {
    const ref = setTimeout(() => {
      reject(new Error("worker timeout"));
    }, 60000);

    worker.onmessage = (msg) => {
      clearTimeout(ref);
      try {
        resolve(JSON.parse(msg.data));
      } catch (err) {
        reject(err);
      }
    };
  }).finally(() => {
    worker.terminate();
  });
};

const loadRadarData = async (
  offset: number = 1,
  numFrames: number = 10
): Promise<RadarRes[]> => {
  const framePromises = Array.from({ length: numFrames }).map((_, i) =>
    getData(i + offset).catch((err) => {
      console.log(`skipping frame ${i} due to error`, err);
      return [];
    })
  );

  const frames = (await Promise.all(framePromises)).flat();
  console.log(`got ${frames.length} total frames`);
  return frames;
};

type RadarTextureData = number[];

export const Radar = () => {
  const ref = useRef<any>();
  const [radarData, setRadarData] = useState<RadarTextureData[]>([]);
  const [canvas, setCanvas] = useState<RadarCanvas | null>(null);

  const size = { width: 4000, height: 4000 };

  useEffect(() => {
    if (ref.current) {
      getData(0)
        .then(parseRadarData)
        .then((data) => setRadarData([data]));

      loadRadarData()
        .then((datas) => datas.map(parseRadarData))
        .then((datas) => {
          datas.reverse();
          setRadarData((prev) => [...datas, ...prev]);
        });

      const newCanvas = new RadarCanvas(ref.current, radarOptions);
      newCanvas.initCanvas();
      setCanvas(newCanvas);

      return () => {
        canvas?.destroy();
      };
    }
  }, [ref]);

  useEffect(() => {
    let isActive = true;

    if (ref.current && canvas) {
      console.log("updated radar data", radarData);

      let frameCounter = 0;
      const advanceFrame = () => {
        if (!isActive) return;

        const frameIndex = frameCounter % radarData.length;
        const frameData = radarData[frameIndex];

        console.log("advance frame", frameIndex);
        canvas.setRadarData((array) => {
          array.set(frameData);
        });

        frameCounter++;

        const delay = frameIndex === radarData.length - 1 ? 1000 : 100;
        setTimeout(() => {
          requestAnimationFrame(advanceFrame);
        }, delay);
      };

      advanceFrame();
      return () => {
        isActive = false;
      };
    }
  }, [radarData]);

  return <canvas ref={ref} width={size.width} height={size.height}></canvas>;
};
