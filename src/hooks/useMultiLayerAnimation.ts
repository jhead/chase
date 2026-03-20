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

interface LayerData {
  siteId: string;
  files: string[];
  loadedFrames: Set<number>;
  initialLoaded: boolean;
  /** Current frame index for this layer (advances independently during playback). */
  currentFrameIndex: number;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4];
const INITIAL_FRAME_BUDGET = 20;

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
      for (const [layerId] of layerDataRef.current.entries()) {
        wasmRef.current?.clear_frame_cache(layerId);
      }
      layerDataRef.current.clear();
    };
  }, []);

  // Teardown layers that have been removed
  useEffect(() => {
    const activeIds = new Set(radarLayers.map((l) => l.id));
    for (const [id] of layerDataRef.current.entries()) {
      if (!activeIds.has(id)) {
        wasmRef.current?.clear_frame_cache(id);
        layerDataRef.current.delete(id);
      }
    }
  }, [radarLayers]);

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
      if (!data.initialLoaded || data.files.length === 0) continue;
      if (layerId === primaryIdRef.current) {
        if (data.loadedFrames.has(primaryFrameIndex)) {
          w.apply_frame(layerId, data.files[primaryFrameIndex]);
          data.currentFrameIndex = primaryFrameIndex;
        }
      } else {
        // Advance this layer to its own next loaded frame
        const next = nextLoadedIndex(
          data.loadedFrames, data.currentFrameIndex,
          Math.max(0, ...data.loadedFrames) + 1, s.loop
        );
        if (next !== null) {
          w.apply_frame(layerId, data.files[next]);
          data.currentFrameIndex = next;
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
    const w = wasmRef.current;
    if (!w) return;

    // Teardown existing data for this layer
    const existing = layerDataRef.current.get(layerId);
    if (existing) {
      w.clear_frame_cache(layerId);
    }

    const isPrimary = layerDataRef.current.size === 0 || layerId === primaryIdRef.current || primaryIdRef.current === null;
    if (isPrimary) primaryIdRef.current = layerId;

    stopTimer();

    const layerData: LayerData = {
      siteId,
      files: [],
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

    w.list_radar_frames(siteId, date)
      .then((json: string) => {
        const data = JSON.parse(json) as { files: string[]; timestamps: string[]; count: number };

        // Guard: if this layer was re-initialized before response arrived, discard
        const current = layerDataRef.current.get(layerId);
        if (!current || current.siteId !== siteId) return;

        const { files, timestamps, count } = data;
        const latestIdx = count > 0 ? count - 1 : 0;

        current.files = files;
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

        // Load the latest frame first (initial — creates mesh)
        w.load_initial_frame(layerId, files[latestIdx], siteId)
          .then(() => {
            const cur = layerDataRef.current.get(layerId);
            if (!cur || cur.siteId !== siteId) return;
            cur.initialLoaded = true;
            cur.loadedFrames.add(latestIdx);

            if (isPrimary) {
              setState((s) => {
                const loaded = new Set(s.loadedFrames);
                loaded.add(latestIdx);
                return { ...s, loadedFrames: loaded, ready: true };
              });
            }
          })
          .catch((err: unknown) => {
            console.error(`[useMultiLayerAnimation] load_initial_frame(${layerId}) failed:`, err);
          });

        // Prefetch remaining frames in the budget
        const prefetchStart = Math.max(0, count - INITIAL_FRAME_BUDGET);
        const indices: number[] = [];
        for (let i = prefetchStart; i < count; i++) {
          if (i !== latestIdx) indices.push(i);
        }

        for (const idx of indices) {
          w.load_frame(layerId, files[idx])
            .then(() => {
              const cur = layerDataRef.current.get(layerId);
              if (!cur || cur.siteId !== siteId) return;
              cur.loadedFrames.add(idx);

              if (isPrimary) {
                setState((s) => {
                  const loaded = new Set(s.loadedFrames);
                  loaded.add(idx);
                  return { ...s, loadedFrames: loaded };
                });
              }
            })
            .catch(() => {
              // Skip failed frames
            });
        }
      })
      .catch((err: unknown) => {
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
