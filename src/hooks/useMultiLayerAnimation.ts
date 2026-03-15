import { useCallback, useEffect, useRef, useState } from "react";
import { useWasm } from "../ctx/WasmContext";
interface RadarLayer {
  id: string;
  kind: string;
  enabled: boolean;
  siteId: string | null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** Global animation state shared across all radar layers. */
export interface AnimationState {
  playing: boolean;
  frameIndex: number;
  frameCount: number;
  speed: number;
  timestamps: string[];
  /** Loaded frames from the PRIMARY layer (drives the scrub bar). */
  loadedFrames: Set<number>;
  ready: boolean;
  loop: boolean;
}

interface CachedFrame {
  data: Uint8Array;
  numRays: number;
  numGates: number;
}

interface LayerData {
  siteId: string;
  pool: Worker[];
  frameCache: Map<number, CachedFrame>;
  loadedFrames: Set<number>;
  initialLoaded: boolean;
  /** Current frame index for this layer (advances independently during playback). */
  currentFrameIndex: number;
}

const NEXRAD_API =
  (import.meta as { env?: { VITE_NEXRAD_API_URL?: string } }).env?.VITE_NEXRAD_API_URL ??
  "http://localhost:8787";

const SPEED_OPTIONS = [0.5, 1, 2, 4];
const INITIAL_FRAME_BUDGET = 20;
const POOL_SIZE = Math.min(navigator.hardwareConcurrency || 4, 8);

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function createWorkerPool(onMessage: (e: MessageEvent, layerId: string) => void, layerId: string): Worker[] {
  const pool: Worker[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker(
      new URL("../workers/radarFrameWorker.ts", import.meta.url),
      { type: "module" }
    );
    w.onmessage = (e) => onMessage(e, layerId);
    pool.push(w);
  }
  return pool;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Multi-layer radar animation hook.
 *
 * Manages one frame cache + worker pool per radar layer while keeping a single
 * global AnimationState (speed, loop, frameIndex, frameCount).
 * On each tick, ALL active layers are advanced simultaneously.
 */
export function useMultiLayerAnimation(radarLayers: RadarLayer[]) {
  const { wasm } = useWasm();
  const wasmRef = useRef(wasm);
  wasmRef.current = wasm;

  // Per-layer data managed imperatively (no re-render on cache hits)
  const layerDataRef = useRef(new Map<string, LayerData>());

  // Primary layer: the first enabled radar layer, used for frameCount/timestamps/loadedFrames
  const primaryIdRef = useRef<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopTimer();
      for (const data of layerDataRef.current.values()) {
        data.pool.forEach((w) => w.terminate());
      }
      layerDataRef.current.clear();
    };
  }, []);

  // Teardown layers that have been removed
  useEffect(() => {
    const activeIds = new Set(radarLayers.map((l) => l.id));
    for (const [id, data] of layerDataRef.current.entries()) {
      if (!activeIds.has(id)) {
        data.pool.forEach((w) => w.terminate());
        layerDataRef.current.delete(id);
      }
    }
  }, [radarLayers]);

  // ── Worker message handler ────────────────────────────────────────────────

  function handleWorkerMessage(e: MessageEvent, layerId: string) {
    const msg = e.data;
    const layerData = layerDataRef.current.get(layerId);
    if (!layerData) return;

    switch (msg.type) {
      case "frame": {
        const w = wasmRef.current;
        if (w && msg.sweep && !layerData.initialLoaded) {
          // Initial load: push sweep geometry into Bevy
          const s = msg.sweep;
          w.add_scan(
            layerId,
            s.elevation_angle,
            s.gate_size_m,
            s.first_gate_m,
            new Float32Array(s.azimuths),
            new Float32Array(s.reflectivity)
          );
          w.commit_volume(layerId, layerData.siteId);
          layerData.initialLoaded = true;
        }
        layerData.frameCache.set(msg.frameIndex, {
          data: msg.data,
          numRays: msg.numRays,
          numGates: msg.numGates,
        });
        layerData.loadedFrames.add(msg.frameIndex);

        // If this is the primary layer, update global loadedFrames
        if (layerId === primaryIdRef.current) {
          setState((s) => {
            const loaded = new Set(s.loadedFrames);
            loaded.add(msg.frameIndex);
            return { ...s, loadedFrames: loaded, ready: true };
          });
        }
        break;
      }
      case "prefetched": {
        layerData.frameCache.set(msg.frameIndex, {
          data: msg.data,
          numRays: msg.numRays,
          numGates: msg.numGates,
        });
        layerData.loadedFrames.add(msg.frameIndex);

        if (layerId === primaryIdRef.current) {
          setState((s) => {
            const loaded = new Set(s.loadedFrames);
            loaded.add(msg.frameIndex);
            return { ...s, loadedFrames: loaded };
          });
        }
        break;
      }
      case "error": {
        console.error(`[radarFrameWorker][${layerId}]`, msg.message);
        break;
      }
    }
  }

  // ── Apply frame to all layers ─────────────────────────────────────────────

  /**
   * Apply a frame to the primary layer at `primaryFrameIndex`.
   * Non-primary layers advance independently through their own loaded frames.
   */
  function applyFrame(primaryFrameIndex: number) {
    const w = wasmRef.current;
    if (!w) return;
    const s = stateRef.current;
    for (const [layerId, data] of layerDataRef.current.entries()) {
      if (!data.initialLoaded) continue;
      if (layerId === primaryIdRef.current) {
        const cached = data.frameCache.get(primaryFrameIndex);
        if (cached) {
          w.update_layer_texture(layerId, cached.numRays, cached.numGates, cached.data);
          data.currentFrameIndex = primaryFrameIndex;
        }
      } else {
        // Advance this layer to its own next loaded frame
        const next = nextLoadedIndex(
          data.loadedFrames, data.currentFrameIndex,
          Math.max(0, ...data.loadedFrames) + 1, s.loop
        );
        if (next !== null) {
          const cached = data.frameCache.get(next);
          if (cached) {
            w.update_layer_texture(layerId, cached.numRays, cached.numGates, cached.data);
            data.currentFrameIndex = next;
          }
        }
      }
    }
  }

  // ── Timer ────────────────────────────────────────────────────────────────

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

      applyFrame(next);
      setState((prev) => ({ ...prev, frameIndex: next }));
    }, intervalMs);
  }

  // ── Public controls ───────────────────────────────────────────────────────

  const play = useCallback(() => {
    setState((s) => {
      if (s.frameCount === 0 || s.loadedFrames.size < 2) return s;

      let startIdx = s.frameIndex;
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
    if (stateRef.current.playing) pause();
    else play();
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
      if (s.playing) startTimer(speed);
      return { ...s, speed };
    });
  }, []);

  const cycleSpeed = useCallback(() => {
    setState((s) => {
      const currentIdx = SPEED_OPTIONS.indexOf(s.speed);
      const nextSpeed = SPEED_OPTIONS[(currentIdx + 1) % SPEED_OPTIONS.length];
      if (s.playing) startTimer(nextSpeed);
      return { ...s, speed: nextSpeed };
    });
  }, []);

  const setLoop = useCallback((loop: boolean) => {
    setState((s) => ({ ...s, loop }));
  }, []);

  const toggleLoop = useCallback(() => {
    setState((s) => ({ ...s, loop: !s.loop }));
  }, []);

  /**
   * Initialize or re-initialize a layer with a new site.
   * Called when the user selects a site in the sidebar.
   */
  const initLayer = useCallback((layerId: string, siteId: string) => {
    // Teardown existing data for this layer
    const existing = layerDataRef.current.get(layerId);
    if (existing) {
      existing.pool.forEach((w) => w.terminate());
    }

    const isPrimary = layerDataRef.current.size === 0 || layerId === primaryIdRef.current || primaryIdRef.current === null;
    if (isPrimary) primaryIdRef.current = layerId;

    stopTimer();

    const layerData: LayerData = {
      siteId,
      pool: [],
      frameCache: new Map(),
      loadedFrames: new Set(),
      initialLoaded: false,
      currentFrameIndex: 0,
    };
    layerDataRef.current.set(layerId, layerData);

    // Reset global state if this is the primary layer
    if (isPrimary) {
      setState((s) => ({
        ...s,
        playing: false,
        frameIndex: 0,
        frameCount: 0,
        timestamps: [],
        loadedFrames: new Set(),
        ready: false,
      }));
    }

    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const date = `${y}/${m}/${day}`;

    fetch(`${NEXRAD_API}?frames=1&date=${encodeURIComponent(date)}&radar=${encodeURIComponent(siteId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Frame list fetch failed: ${res.status}`);
        return res.json() as Promise<{ files: string[]; timestamps: string[]; count: number }>;
      })
      .then((data) => {
        // Guard: if this layer was re-initialized before response arrived, discard
        const current = layerDataRef.current.get(layerId);
        if (!current || current.siteId !== siteId) return;

        const { files, timestamps, count } = data;
        const latestIdx = count > 0 ? count - 1 : 0;

        // Set the layer's initial frame position to the latest frame
        current.currentFrameIndex = latestIdx;

        if (isPrimary) {
          setState((s) => ({
            ...s,
            frameCount: count,
            timestamps,
            ready: count > 0,
            frameIndex: latestIdx,
          }));
        }

        if (count === 0) return;

        const pool = createWorkerPool(handleWorkerMessage, layerId);
        current.pool = pool;

        for (const w of pool) {
          w.postMessage({ type: "setFiles", files, baseUrl: NEXRAD_API });
        }

        pool[0].postMessage({ type: "fetch", frameIndex: latestIdx, initial: true });

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
        console.error(`[useMultiLayerAnimation] initLayer(${layerId}) failed:`, err);
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
    initLayer,
  };
}
