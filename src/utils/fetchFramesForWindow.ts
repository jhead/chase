import type { NexradWasm } from "../ctx/WasmContext";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function utcDatePath(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

/**
 * Fetch all available radar frames for `site` within `[windowStartMs, windowEndMs]`.
 *
 * Handles windows that span midnight UTC by querying each unique UTC date in the
 * window and merging the results. Frames are returned sorted by timestamp ascending.
 */
export async function fetchFramesForWindow(
  wasm: NexradWasm,
  site: string,
  windowStartMs: number,
  windowEndMs: number,
): Promise<{ files: string[]; timestampsMs: number[] }> {
  // Collect unique UTC dates in the window
  const dates = new Set<string>();
  // Walk day-by-day from start to end
  for (let d = windowStartMs; d <= windowEndMs; d += 24 * 3600_000) {
    dates.add(utcDatePath(d));
  }
  // Always include the end date (handles sub-day windows)
  dates.add(utcDatePath(windowEndMs));

  const all: { file: string; tsMs: number }[] = [];

  for (const date of dates) {
    let json: { files: string[]; timestamps: string[]; count: number };
    try {
      json = JSON.parse(await wasm.list_radar_frames(site, date));
    } catch {
      continue; // no data for this date, skip
    }
    for (let i = 0; i < json.count; i++) {
      const tsMs = new Date(json.timestamps[i]).getTime();
      if (!Number.isNaN(tsMs) && tsMs >= windowStartMs && tsMs <= windowEndMs) {
        all.push({ file: json.files[i], tsMs });
      }
    }
  }

  all.sort((a, b) => a.tsMs - b.tsMs);

  return {
    files: all.map((x) => x.file),
    timestampsMs: all.map((x) => x.tsMs),
  };
}
