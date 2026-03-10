import { useCallback, useEffect, useRef, useState } from "react";
import { useWasm } from "../ctx/WasmContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnimationState {
  playing: boolean;
  frameIndex: number;
  frameCount: number;
  speed: number; // multiplier: 0.5, 1, 2, 4 (1x = 5fps = 200ms/frame)
  timestamps: string[];
  loadedFrames: Set<number>;
  ready: boolean; // true when frame list loaded and >=1 frame cached
  loop: boolean;
}

interface CachedFrame {
  data: Uint8Array;
  numRays: number;
  numGates: number;
}

const NEXRAD_API =
  (import.meta as { env?: { VITE_NEXRAD_API_URL?: string } }).env?.VITE_NEXRAD_API_URL ??
  "http://localhost:8787";

const SPEED_OPTIONS = [0.5, 1, 2, 4];
const INITIAL_FRAME_BUDGET = 20;
const POOL_SIZE = Math.min(navigator.hardwareConcurrency || 4, 8);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Given the set of loaded frame indices, find the next loaded index after `current`.
 *  If `loop` is true and we pass the max, wrap to the smallest loaded index. */
function nextLoadedIndex(loaded: Set<number>, current: number, frameCount: number, loop: boolean): number | null {
  for (let i = current + 1; i < frameCount; i++) {
    if (loaded.has(i)) return i;
  }
  if (loop) {
    for (let i = 0; i <= current; i++) {
      if (loaded.has(i)) return i;
    }
  }
  return null;
}

function prevLoadedIndex(loaded: Set<number>, current: number, frameCount: number, loop: boolean): number | null {
  for (let i = current - 1; i >= 0; i--) {
    if (loaded.has(i)) return i;
  }
  if (loop) {
    for (let i = frameCount - 1; i >= current; i--) {
      if (loaded.has(i)) return i;
    }
  }
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRadarAnimation() {
  const { wasm } = useWasm();
  const poolRef = useRef<Worker[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const siteIdRef = useRef<string | null>(null);
  const initialLoadedRef = useRef(false);
  const frameCacheRef = useRef(new Map<number, CachedFrame>());

  const [state, setState] = useState<AnimationState>({
    playing: false,
    frameIndex: 0,
    frameCount: 0,
    speed: 1,
    timestamps: [],
    loadedFrames: new Set(),
    ready: false,
    loop: true,
  });

  // Refs that mirror state for use in timer callbacks (avoids stale closures)
  const stateRef = useRef(state);
  stateRef.current = state;

  const wasmRef = useRef(wasm);
  wasmRef.current = wasm;

  // ── Worker pool lifecycle ─────────────────────────────────────────────────

  function createPool(): Worker[] {
    const pool: Worker[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const w = new Worker(
        new URL("../workers/radarFrameWorker.ts", import.meta.url),
        { type: "module" }
      );
      w.onmessage = handleWorkerMessage;
      pool.push(w);
    }
    return pool;
  }

  function terminatePool() {
    for (const w of poolRef.current) w.terminate();
    poolRef.current = [];
  }

  useEffect(() => {
    return () => {
      stopTimer();
      terminatePool();
    };
  }, []);

  // ── Worker message handler ────────────────────────────────────────────────

  function handleWorkerMessage(e: MessageEvent) {
    const msg = e.data;
    switch (msg.type) {
      case "frame": {
        const w = wasmRef.current;
        if (w && msg.sweep) {
          // Initial frame — create Bevy mesh entity via add_scan/commit_volume
          const s = msg.sweep;
          w.add_scan(
            s.elevation_angle,
            s.gate_size_m,
            s.first_gate_m,
            new Float32Array(s.azimuths),
            new Float32Array(s.reflectivity)
          );
          w.commit_volume(siteIdRef.current ?? "");
          initialLoadedRef.current = true;
        }
        // Store in local cache (data was transferred via Transferable, no copy needed)
        frameCacheRef.current.set(msg.frameIndex, {
          data: msg.data,
          numRays: msg.numRays,
          numGates: msg.numGates,
        });
        setState((s) => {
          const loaded = new Set(s.loadedFrames);
          loaded.add(msg.frameIndex);
          return { ...s, loadedFrames: loaded };
        });
        break;
      }
      case "prefetched": {
        // Store in local cache
        frameCacheRef.current.set(msg.frameIndex, {
          data: msg.data,
          numRays: msg.numRays,
          numGates: msg.numGates,
        });
        setState((s) => {
          const loaded = new Set(s.loadedFrames);
          loaded.add(msg.frameIndex);
          return { ...s, loadedFrames: loaded };
        });
        break;
      }
      case "error": {
        console.error("[radarFrameWorker]", msg.message);
        break;
      }
    }
  }

  // ── Apply frame to WASM (local cache, no worker round-trip) ───────────────

  function applyFrame(frameIndex: number) {
    const cached = frameCacheRef.current.get(frameIndex);
    if (cached && wasmRef.current && initialLoadedRef.current) {
      wasmRef.current.update_base_texture(cached.numRays, cached.numGates, cached.data);
    }
  }

  // ── Timer management ──────────────────────────────────────────────────────

  function stopTimer() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer(speed: number) {
    stopTimer();
    const intervalMs = 200 / speed;
    timerRef.current = setInterval(() => {
      const s = stateRef.current;
      if (s.frameCount === 0 || s.loadedFrames.size < 2) return;

      const next = nextLoadedIndex(s.loadedFrames, s.frameIndex, s.frameCount, s.loop);
      if (next === null) {
        stopTimer();
        setState((prev) => ({ ...prev, playing: false }));
        return;
      }

      // Use local cache directly — no worker round-trip
      applyFrame(next);
      setState((prev) => ({ ...prev, frameIndex: next }));
    }, intervalMs);
  }

  // ── Public controls ───────────────────────────────────────────────────────

  const play = useCallback(() => {
    setState((s) => {
      if (s.frameCount === 0 || s.loadedFrames.size < 2) return s;

      let startIdx = s.frameIndex;

      // If at the end of loaded frames, restart from the first loaded frame
      const next = nextLoadedIndex(s.loadedFrames, s.frameIndex, s.frameCount, false);
      if (next === null) {
        const sorted = [...s.loadedFrames].sort((a, b) => a - b);
        startIdx = sorted[0];
        applyFrame(startIdx);
      }

      startTimer(s.speed);
      return { ...s, playing: true, frameIndex: startIdx };
    });
  }, []);

  const pause = useCallback(() => {
    stopTimer();
    setState((s) => ({ ...s, playing: false }));
  }, []);

  const togglePlay = useCallback(() => {
    if (stateRef.current.playing) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  const nextFrame = useCallback(() => {
    const s = stateRef.current;
    if (s.frameCount === 0) return;
    const next = nextLoadedIndex(s.loadedFrames, s.frameIndex, s.frameCount, s.loop);
    if (next === null) return;
    applyFrame(next);
    setState((prev) => ({ ...prev, frameIndex: next }));
  }, []);

  const prevFrame = useCallback(() => {
    const s = stateRef.current;
    if (s.frameCount === 0) return;
    const prev = prevLoadedIndex(s.loadedFrames, s.frameIndex, s.frameCount, s.loop);
    if (prev === null) return;
    applyFrame(prev);
    setState((p) => ({ ...p, frameIndex: prev }));
  }, []);

  const seekTo = useCallback((index: number) => {
    const s = stateRef.current;
    if (s.frameCount === 0) return;
    const clamped = Math.max(0, Math.min(s.frameCount - 1, index));
    if (s.loadedFrames.has(clamped)) {
      applyFrame(clamped);
      setState((prev) => ({ ...prev, frameIndex: clamped }));
    } else {
      const next = nextLoadedIndex(s.loadedFrames, clamped - 1, s.frameCount, false);
      if (next !== null) {
        applyFrame(next);
        setState((prev) => ({ ...prev, frameIndex: next }));
      }
    }
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((s) => {
      if (s.playing) {
        startTimer(speed);
      }
      return { ...s, speed };
    });
  }, []);

  const cycleSpeed = useCallback(() => {
    setState((s) => {
      const currentIdx = SPEED_OPTIONS.indexOf(s.speed);
      const nextSpeed = SPEED_OPTIONS[(currentIdx + 1) % SPEED_OPTIONS.length];
      if (s.playing) {
        startTimer(nextSpeed);
      }
      return { ...s, speed: nextSpeed };
    });
  }, []);

  const setLoop = useCallback((loop: boolean) => {
    setState((s) => ({ ...s, loop }));
  }, []);

  const toggleLoop = useCallback(() => {
    setState((s) => ({ ...s, loop: !s.loop }));
  }, []);

  const init = useCallback((siteId: string) => {
    // Terminate old workers to prevent stale data from a previous site
    terminatePool();
    stopTimer();

    siteIdRef.current = siteId;
    initialLoadedRef.current = false;
    frameCacheRef.current.clear();
    setState((s) => ({
      ...s,
      playing: false,
      frameIndex: 0,
      frameCount: 0,
      timestamps: [],
      loadedFrames: new Set(),
      ready: false,
    }));

    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const date = `${y}/${m}/${day}`;

    // Fetch frame list on main thread, then distribute parsing across worker pool
    fetch(`${NEXRAD_API}?frames=1&date=${encodeURIComponent(date)}&radar=${encodeURIComponent(siteId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Frame list fetch failed: ${res.status}`);
        return res.json() as Promise<{ files: string[]; timestamps: string[]; count: number }>;
      })
      .then((data) => {
        if (siteIdRef.current !== siteId) return; // site changed, discard

        const { files, timestamps, count } = data;
        const latestIdx = count > 0 ? count - 1 : 0;

        setState((s) => ({
          ...s,
          frameCount: count,
          timestamps,
          ready: count > 0,
          frameIndex: latestIdx,
        }));

        if (count === 0) return;

        // Create fresh worker pool
        const pool = createPool();
        poolRef.current = pool;

        // Send file list to all workers
        for (const w of pool) {
          w.postMessage({ type: "setFiles", files, baseUrl: NEXRAD_API });
        }

        // Fetch initial frame with sweep metadata (worker[0])
        pool[0].postMessage({ type: "fetch", frameIndex: latestIdx, initial: true });

        // Distribute remaining prefetch indices across the pool (round-robin)
        const prefetchStart = Math.max(0, count - INITIAL_FRAME_BUDGET);
        const indices: number[] = [];
        for (let i = prefetchStart; i < count; i++) {
          if (i !== latestIdx) indices.push(i);
        }
        if (indices.length > 0) {
          const batches: number[][] = Array.from({ length: pool.length }, () => []);
          indices.forEach((idx, i) => batches[i % pool.length].push(idx));
          for (let i = 0; i < pool.length; i++) {
            if (batches[i].length > 0) {
              pool[i].postMessage({ type: "prefetch", indices: batches[i] });
            }
          }
        }
      })
      .catch((err) => {
        console.error("[useRadarAnimation] Init failed:", err);
      });
  }, []);

  return {
    state,
    play,
    pause,
    togglePlay,
    nextFrame,
    prevFrame,
    seekTo,
    setSpeed,
    cycleSpeed,
    setLoop,
    toggleLoop,
    init,
  };
}
