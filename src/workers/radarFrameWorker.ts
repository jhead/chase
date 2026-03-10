/**
 * Browser Web Worker — Fetches + parses NEXRAD L2 frames.
 *
 * Part of a worker pool. Main thread manages frame list, caching, and distribution.
 * Each worker receives its share of frames to parse in parallel with other workers.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- nexrad-level-2-data has no type declarations
import { Level2Radar } from "nexrad-level-2-data";
import { Buffer } from "buffer";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Full sweep metadata returned only for the initial frame (used to create mesh entity). */
interface SweepMeta {
  elevation_angle: number;
  gate_size_m: number;
  first_gate_m: number;
  azimuths: number[];       // sorted by azimuth
  reflectivity: number[];   // normalized 0-1, row-major [ray][gate]
}

// React → Worker messages
type InMessage =
  | { type: "setFiles"; files: string[]; baseUrl: string }
  | { type: "fetch"; frameIndex: number; initial?: boolean }
  | { type: "prefetch"; indices: number[] };

// ── State ─────────────────────────────────────────────────────────────────────

let baseUrl = "";
let files: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseElevation(
  radar: any,
  elevationNum: number,
  includeSweepMeta: boolean
): { data: Uint8Array; numRays: number; numGates: number; sweep?: SweepMeta } | null {
  radar.setElevation(elevationNum);
  const rays = radar.getHighresReflectivity() as any[];
  const azs = radar.getAzimuth() as number[];
  if (!rays?.length || !azs?.length) return null;

  const firstRay = rays[0];
  const numGates: number = firstRay?.gate_count ?? 0;
  if (numGates === 0) return null;

  const numRays = azs.length;

  // Sort rays by azimuth for consistent UV mapping (matches volume load path)
  const rayOrder = Array.from({ length: numRays }, (_, i) => i).sort(
    (a, b) => azs[a] - azs[b]
  );
  const sortedRays = rayOrder.map((i) => rays[i]);
  const sortedAzs = rayOrder.map((i) => azs[i]);

  const data = new Uint8Array(numRays * numGates);
  const reflectivity: number[] | null = includeSweepMeta ? [] : null;

  for (let r = 0; r < numRays; r++) {
    const momentData: (number | null)[] = sortedRays[r]?.moment_data ?? [];
    const rowOffset = r * numGates;
    for (let g = 0; g < numGates; g++) {
      const v = momentData[g];
      if (v != null && typeof v === "number") {
        const norm = Math.max(0, Math.min(1, v / 75));
        data[rowOffset + g] = Math.round(norm * 255);
        reflectivity?.push(norm);
      } else {
        reflectivity?.push(0);
      }
    }
  }

  if (!includeSweepMeta) return { data, numRays, numGates };

  const header = radar.getHeader(0) as { elevation_angle?: number } | undefined;
  const elevationAngle = header?.elevation_angle ?? elevationNum * 0.5;
  const gateSizeM: number = (firstRay?.gate_size ?? 0.25) * 1000;
  const firstGateM: number = (firstRay?.first_gate ?? 2.125) * 1000;

  return {
    data,
    numRays,
    numGates,
    sweep: {
      elevation_angle: elevationAngle,
      gate_size_m: gateSizeM,
      first_gate_m: firstGateM,
      azimuths: sortedAzs,
      reflectivity: reflectivity!,
    },
  };
}

async function fetchRaw(frameIndex: number): Promise<ArrayBuffer | null> {
  const file = files[frameIndex];
  if (!file) return null;
  const url = `${baseUrl}/s3/unidata-nexrad-level2/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

function parseRaw(rawData: ArrayBuffer, includeSweepMeta: boolean) {
  const radar = new Level2Radar(Buffer.from(rawData));
  const elevations = radar.listElevations();
  if (elevations.length === 0) return null;
  return parseElevation(radar, elevations[0], includeSweepMeta);
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  const worker = self as unknown as Worker;

  try {
    switch (msg.type) {
      case "setFiles": {
        files = msg.files;
        baseUrl = msg.baseUrl;
        break;
      }

      case "fetch": {
        const initial = msg.initial === true;
        const rawData = await fetchRaw(msg.frameIndex);
        if (!rawData) break;
        const result = parseRaw(rawData, initial);
        if (result) {
          const copy = new Uint8Array(result.data);
          worker.postMessage(
            {
              type: "frame",
              frameIndex: msg.frameIndex,
              data: copy,
              numRays: result.numRays,
              numGates: result.numGates,
              sweep: result.sweep,
            },
            [copy.buffer]
          );
        }
        break;
      }

      case "prefetch": {
        // Start all network fetches in parallel (IO-bound)
        const fetches = msg.indices.map(async (idx) => {
          try {
            const rawData = await fetchRaw(idx);
            return rawData ? { idx, rawData } : null;
          } catch {
            return null;
          }
        });

        // Parse results as they resolve (CPU-bound, sequential per worker thread)
        for (const promise of fetches) {
          try {
            const fetched = await promise;
            if (!fetched) continue;
            const result = parseRaw(fetched.rawData, false);
            if (result) {
              const copy = new Uint8Array(result.data);
              worker.postMessage(
                {
                  type: "prefetched",
                  frameIndex: fetched.idx,
                  data: copy,
                  numRays: result.numRays,
                  numGates: result.numGates,
                },
                [copy.buffer]
              );
            }
          } catch {
            // Skip failed frames
          }
        }
        break;
      }
    }
  } catch (err) {
    worker.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
