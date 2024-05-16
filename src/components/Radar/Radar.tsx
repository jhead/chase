import { useEffect, useRef, useState } from "react";
import RadarCanvas from "./RadarCanvas";

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
  const buffer = new Float32Array(numGates * numRays);

  data.rays.sort((a, b) => a.azimuth - b.azimuth);
  console.log(data.rays.map(({ azimuth }) => azimuth));

  // data.rays.forEach((ray, rayIndex) => {
  //   const az = data.azs[rayIndex];

  //   console.log(, rayIndex, ray);
  //   ray.moment_data.forEach((gate, gateOffset) => {
  //     // const index = (i * numRays) + gateOffset;
  //   });
  // });

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

const getData = async (frame: number): Promise<RadarRes> => {
  const res = await fetch(
    `http://localhost:8787?gates=${numGates}&frame=${frame}`
  );

  return await res.json();
};

const loadRadarData = async (
  offset: number = 1,
  numFrames: number = 10
): Promise<RadarRes[]> => {
  const framePromises = Array.from({ length: numFrames }).map((_, i) =>
    getData(i + offset)
  );

  return Promise.all(framePromises);
};

type RadarTextureData = number[];

export const Radar = () => {
  const ref = useRef<any>();
  const [radarData, setRadarData] = useState<RadarTextureData[]>([]);
  const [canvas, setCanvas] = useState<RadarCanvas | null>(null);

  const size = { width: 500, height: 500 };

  useEffect(() => {
    if (ref.current) {
      getData(0)
        .then(parseRadarData)
        .then((data) => setRadarData([data]));

      loadRadarData()
        .then((datas) => datas.map(parseRadarData))
        .then(setRadarData);

      const newCanvas = new RadarCanvas(ref.current, radarOptions);
      newCanvas.initCanvas();
      setCanvas(newCanvas);

      return () => {
        canvas?.destroy();
      };
    }
  }, [ref]);

  useEffect(() => {
    if (ref.current && canvas) {
      console.log("updated radar data", radarData);
      // canvas.setRadarData((array) => {
      //   array.set(radarData);
      // });

      let frameCounter = 0;
      const inter = setInterval(() => {
        const frameIndex = frameCounter % radarData.length;
        const frameData = radarData[frameIndex];

        canvas.setRadarData((array) => {
          array.set(frameData);
        });

        frameCounter++;
      }, 100);

      return () => {
        clearInterval(inter);
      };
    }
  }, [radarData]);

  return (
    <canvas
      ref={ref}
      width={size.width}
      height={size.height}
      style={{
        width: size.width,
        height: size.height,
      }}
    ></canvas>
  );
};
