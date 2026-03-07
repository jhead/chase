import { useEffect, useRef, useState } from "react";
import RadarCanvas from "./RadarCanvas";
import RadarWebWorker from "../../../workers/nexrad/src/webworker.ts?worker";
import styled from "@emotion/styled";
import { RadarSite } from "../ChaserMap";
import { radarCache } from "../../utils/radarCache";

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

type RadarTextureData = {
  rays: RadarRay[];
  azs: number[];
  rawData: Float32Array;
};

const numRays = 720;
const numGates = 2000;
const radarOptions = {
  numGates,
  numRays,
};

const INITIAL_FRAME_COUNT = 3; // Load fewer frames initially
const BACKGROUND_FRAME_COUNT = 7; // Load more frames in the background

const DEFAULT_FRAME_INTERVAL = 250; // 250ms between frames
const SPEED_OPTIONS = [
  { label: "0.5x", value: 500 },
  { label: "1x", value: 250 },
  { label: "2x", value: 125 },
  { label: "4x", value: 62.5 },
];

const parseRadarData = (data: RadarRes): RadarTextureData => {
  // Pre-allocate arrays for better performance
  const output = new Float32Array(numRays * numGates);
  const rays: RadarRay[] = new Array(numRays);
  const azs: number[] = new Array(numRays);

  // Sort rays once
  data.rays.sort((a, b) => a.azimuth - b.azimuth);

  // Process each ray
  for (let iRay = 0; iRay < numRays; iRay++) {
    const ray = data.rays[iRay];
    if (!ray) continue;

    // Store ray metadata
    rays[iRay] = ray;
    azs[iRay] = ray.azimuth;

    // Process gates for this ray
    const rayOffset = iRay * numGates;
    for (let iGate = 0; iGate < numGates; iGate++) {
      output[rayOffset + iGate] =
        iGate > ray.gate_count ? 0 : Math.max(0, ray.moment_data[iGate] / 75);
    }
  }

  return {
    rays,
    azs,
    rawData: output,
  };
};

const isRadarRes = (data: unknown): data is RadarRes => {
  if (!data || typeof data !== "object") return false;
  const res = data as any;
  return Array.isArray(res.rays) && Array.isArray(res.azs);
};

const getData = async (
  frame: number,
  radarSite: RadarSite
): Promise<RadarRes> => {
  const worker = new RadarWebWorker();
  const today = new Date();
  const date = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}/${String(today.getDate()).padStart(2, "0")}`;

  console.log("Creating new worker instance");
  console.log("Fetching radar data:", {
    date,
    radarName: radarSite.id,
    frameIndex: frame,
  });

  const message = {
    date,
    radarName: radarSite.id,
    frameIndex: frame,
    baseUrl:
      import.meta.env.VITE_NEXRAD_API_URL || "http://localhost:8787",
  };

  console.log("Sending message to worker:", message);
  worker.postMessage(JSON.stringify(message));

  return new Promise<RadarRes>((resolve, reject) => {
    const ref = setTimeout(() => {
      console.log("Worker timeout after 60 seconds");
      reject(new Error("worker timeout"));
    }, 60000);

    worker.onmessage = (msg) => {
      console.log("Received message from worker:", msg.data);
      clearTimeout(ref);
      try {
        const data = JSON.parse(msg.data);
        if (!isRadarRes(data)) {
          console.error("Invalid radar data format:", data);
          throw new Error("Invalid radar data format from worker");
        }
        console.log("Successfully parsed radar data");
        resolve(data);
      } catch (err) {
        console.error("Error processing radar data:", err);
        reject(err);
      }
    };

    worker.onerror = (error) => {
      console.error("Worker error:", error);
      reject(error);
    };

    worker.onmessageerror = (error) => {
      console.error("Worker message error:", error);
      reject(error);
    };
  }).finally(() => {
    console.log("Terminating worker");
    worker.terminate();
  });
};


const RadarContainer = styled.div`
  width: 100%;
  height: 50%;
  position: relative;
  overflow: hidden;
  background: #000;
`;

const RadarCanvasElement = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
`;

const ControlsContainer = styled.div`
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  padding: 12px;
  border-radius: 8px;
  display: flex;
  gap: 12px;
  align-items: center;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
`;

const SpeedSelect = styled.select`
  background: #222;
  color: white;
  border: 1px solid #444;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  min-width: 80px;

  &:hover {
    background: #333;
  }

  &:focus {
    outline: none;
    border-color: #666;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
  }
`;

const LoadingIndicator = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  padding: 12px;
  border-radius: 8px;
  display: flex;
  gap: 12px;
  align-items: center;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
`;

const ProgressBar = styled.div<{ progress: number }>`
  width: 100px;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
  position: relative;

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: ${(props) => props.progress * 100}%;
    background: #4caf50;
    transition: width 0.2s ease;
  }
`;

const LoadingText = styled.div`
  color: white;
  font-size: 14px;
  min-width: 120px;
`;

type RadarProps = {
  radarSite: RadarSite | null;
};

export const Radar: React.FC<RadarProps> = ({ radarSite }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [radarData, setRadarData] = useState<RadarTextureData[]>([]);
  const [canvas, setCanvas] = useState<RadarCanvas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [frameInterval, setFrameInterval] = useState(DEFAULT_FRAME_INTERVAL);
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number>(0);
  const currentFrameIndex = useRef<number>(0);
  const [isFullyLoaded, setIsFullyLoaded] = useState(false);
  const expectedFrameCount = INITIAL_FRAME_COUNT + BACKGROUND_FRAME_COUNT;

  // Load initial frames
  const loadInitialFrames = async (radarSite: RadarSite, date: string) => {
    const framePromises = Array.from({ length: INITIAL_FRAME_COUNT }).map(
      (_, i) =>
        getData(i, radarSite)
          .then(parseRadarData)
          .catch((err) => {
            console.log(`skipping frame ${i} due to error`, err);
            return null;
          })
    );

    const frames = (await Promise.all(framePromises)).filter(
      (frame): frame is RadarTextureData => frame !== null
    );

    if (frames.length > 0) {
      // Cache the initial frames in reverse order
      radarCache.set(
        { radarSite, date },
        frames.map((frame) => frame.rawData).reverse(),
        frames.map((_, i) => i).reverse()
      );
    }

    return frames.reverse(); // Return frames in reverse order
  };

  // Load additional frames in the background
  const loadBackgroundFrames = async (radarSite: RadarSite, date: string) => {
    setIsLoadingMore(true);
    try {
      const framePromises = Array.from({ length: BACKGROUND_FRAME_COUNT }).map(
        (_, i) =>
          getData(i + INITIAL_FRAME_COUNT, radarSite)
            .then(parseRadarData)
            .catch((err) => {
              console.log(`skipping background frame ${i} due to error`, err);
              return null;
            })
      );

      const frames = (await Promise.all(framePromises)).filter(
        (frame): frame is RadarTextureData => frame !== null
      );

      if (frames.length > 0) {
        setRadarData((prev) => {
          const newData = [...prev, ...frames.reverse()]; // Add frames in reverse order
          // Check if we have all expected frames
          if (newData.length >= expectedFrameCount) {
            setIsFullyLoaded(true);
            setIsLoading(false);
          }
          return newData;
        });

        // Update cache with new frames in reverse order
        const cachedData = radarCache.get({ radarSite, date });
        if (cachedData) {
          radarCache.update(
            { radarSite, date },
            frames.map((frame) => frame.rawData).reverse(),
            frames.map((_, i) => i + INITIAL_FRAME_COUNT).reverse()
          );
        }
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!radarSite) {
      console.log("No radar site selected, clearing data");
      setRadarData([]);
      setIsFullyLoaded(false);
      return;
    }

    console.log("Radar site selected:", radarSite);
    setError(null);
    setIsLoading(true);
    setIsFullyLoaded(false);

    const today = new Date();
    const date = `${today.getFullYear()}/${String(
      today.getMonth() + 1
    ).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;

    // Check cache first
    const cachedData = radarCache.get({ radarSite, date });
    if (cachedData) {
      console.log("Using cached radar data");
      const parsedData = cachedData.frames.map((frame: Float32Array) => ({
        rays: [] as RadarRay[],
        azs: [] as number[],
        rawData: frame,
      }));
      setRadarData(parsedData);

      // If we have all frames from cache, we're fully loaded
      if (parsedData.length >= expectedFrameCount) {
        setIsFullyLoaded(true);
        setIsLoading(false);
      } else {
        // Load additional frames in the background if we have cached data
        loadBackgroundFrames(radarSite, date);
      }
      return;
    }

    // If not in cache, load initial frames
    loadInitialFrames(radarSite, date)
      .then((frames) => {
        setRadarData(frames);
        // Load additional frames in the background
        loadBackgroundFrames(radarSite, date);
      })
      .catch((err) => {
        console.error("Error loading radar data:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load radar data"
        );
        setRadarData([]);
        setIsLoading(false);
      });
  }, [radarSite]);

  useEffect(() => {
    if (ref.current) {
      // Set canvas size to match container
      const container = ref.current.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        ref.current.width = rect.width;
        ref.current.height = rect.height;
      }

      const newCanvas = new RadarCanvas(ref.current, radarOptions);
      newCanvas.initCanvas();
      setCanvas(newCanvas);

      // Handle window resize
      const handleResize = () => {
        if (ref.current && container) {
          const rect = container.getBoundingClientRect();
          ref.current.width = rect.width;
          ref.current.height = rect.height;
          newCanvas.initCanvas();
        }
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  useEffect(() => {
    if (canvas && radarData.length > 0) {
      const currentFrame = radarData[0]; // Use the first frame for now
      canvas.setRadarData((data: Float32Array) => {
        data.set(currentFrame.rawData);
      });
    }
  }, [canvas, radarData]);

  // Animation loop
  useEffect(() => {
    if (!canvas || radarData.length === 0) return;

    const animate = (timestamp: number) => {
      const elapsed = timestamp - lastFrameTimeRef.current;

      if (elapsed >= frameInterval) {
        // Use the current frame index to get the correct frame
        const currentFrame = radarData[currentFrameIndex.current];
        canvas.setRadarData((data: Float32Array) => {
          data.set(currentFrame.rawData);
        });

        // Update frame index to move forward through the frames
        currentFrameIndex.current =
          (currentFrameIndex.current + 1) % radarData.length;
        lastFrameTimeRef.current = timestamp;
      }

      // Schedule next frame
      animationRef.current = requestAnimationFrame(animate);
    };

    // Reset frame index when starting animation
    currentFrameIndex.current = 0;
    lastFrameTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [canvas, radarData, currentFrameIndex, frameInterval]);

  const handleSpeedChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setFrameInterval(Number(event.target.value));
  };

  return (
    <RadarContainer>
      {error && <div style={{ color: "red", padding: "10px" }}>{error}</div>}
      <RadarCanvasElement ref={ref} />
      {isLoading && !isFullyLoaded && (
        <LoadingIndicator>
          <ProgressBar
            progress={Math.min(radarData.length / expectedFrameCount, 1)}
          />
          <LoadingText>
            {isLoadingMore
              ? `Loading additional frames... ${Math.min(
                  Math.round((radarData.length / expectedFrameCount) * 100),
                  100
                )}%`
              : `Loading initial frames... ${Math.min(
                  Math.round((radarData.length / expectedFrameCount) * 100),
                  100
                )}%`}
          </LoadingText>
        </LoadingIndicator>
      )}
      {isFullyLoaded && (
        <ControlsContainer>
          <SpeedSelect value={frameInterval} onChange={handleSpeedChange}>
            {SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SpeedSelect>
        </ControlsContainer>
      )}
    </RadarContainer>
  );
};
