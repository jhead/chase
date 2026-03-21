import { useCallback, useEffect, useRef, useState } from "react";
import { useWasm } from "../ctx/WasmContext";
import { fetchFramesForWindow } from "../utils/fetchFramesForWindow";
import { workerFetch } from "../workers/radarWorkerClient";

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
  /** Current wall-clock playback position (Unix ms). */
  playbackTimeMs: number;
  /** Start of the loaded window (endTime − WINDOW_MS). */
  windowStartMs: number;
  /** End of the loaded window (selected end time T). */
  windowEndMs: number;
  speed: number;
  /** Union of all layer frame timestamps, sorted ascending. Used by ScrubBar. */
  allTimestampsMs: number[];
  /** Timestamps (Unix ms) of loaded frames in the PRIMARY layer. */
  loadedTimestampsMs: Set<number>;
  ready: boolean;
  loop: boolean;
}

interface LayerData {
  siteId: string;
  files: string[];
  /** Parallel to files[]: Unix ms timestamp for each frame. */
  timestampsMs: number[];
  loadedFrames: Set<number>;
  initialLoaded: boolean;
  currentFrameIndex: number;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4];
/** Default lookback window: 2 hours. */
const WINDOW_MS = 2 * 3600_000;
/** Real-time tick interval (ms). */
const TICK_MS = 100;
/** Number of frames to prefetch around the initial frame. */
const INITIAL_FRAME_BUDGET = 20;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Multi-layer radar animation hook.
 *
 * Manages one frame cache per radar layer while keeping a single global
 * AnimationState driven by wall-clock time. On each tick all active layers
 * show the frame whose timestamp is closest to (and ≤) the current playback time.
 */
export function useMultiLayerAnimation(radarLayers: RadarLayer[]) {
  const { wasm } = useWasm();
  const wasmRef = useRef(wasm);
  wasmRef.current = wasm;

  // Per-layer data managed imperatively (no re-render on cache hits)
  const layerDataRef = useRef(new Map<string, LayerData>());

  // Primary layer: the first enabled radar layer, drives loadedTimestampsMs
  const primaryIdRef = useRef<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<AnimationState>({
    playing: false,
    playbackTimeMs: Date.now(),
    windowStartMs: Date.now() - WINDOW_MS,
    windowEndMs: Date.now(),
    speed: 1,
    allTimestampsMs: [],
    loadedTimestampsMs: new Set(),
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

  // Teardown layers that have been removed or disabled
  useEffect(() => {
    const activeIds = new Set(radarLayers.map((l) => l.id));
    let changed = false;
    for (const [id] of layerDataRef.current.entries()) {
      if (!activeIds.has(id)) {
        wasmRef.current?.clear_frame_cache(id);
        layerDataRef.current.delete(id);
        if (primaryIdRef.current === id) primaryIdRef.current = null;
        changed = true;
      }
    }
    if (changed) {
      // Re-elect primary to first remaining layer
      if (primaryIdRef.current === null) {
        const firstId = radarLayers[0]?.id ?? null;
        primaryIdRef.current = firstId;
      }
      const newPrimary = primaryIdRef.current
        ? layerDataRef.current.get(primaryIdRef.current)
        : null;
      const newLoaded = newPrimary
        ? new Set([...newPrimary.loadedFrames].map((i) => newPrimary.timestampsMs[i]))
        : new Set<number>();
      setState((s) => ({
        ...s,
        allTimestampsMs: mergeAllTimestamps(),
        loadedTimestampsMs: newLoaded,
        ready: layerDataRef.current.size > 0 && (newPrimary?.initialLoaded ?? false),
      }));
    }
  }, [radarLayers]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Merge all layer timestamps into a sorted, deduplicated array. */
  function mergeAllTimestamps(): number[] {
    const all = new Set<number>();
    for (const data of layerDataRef.current.values()) {
      for (const ts of data.timestampsMs) all.add(ts);
    }
    return [...all].sort((a, b) => a - b);
  }

  // ── Apply frame to all layers at a given wall-clock time ──────────────────

  function applyFrameAtTime(playbackTimeMs: number) {
    const w = wasmRef.current;
    if (!w) return;
    for (const [layerId, data] of layerDataRef.current.entries()) {
      if (!data.initialLoaded || data.files.length === 0) continue;
      // Find the latest LOADED frame whose timestamp ≤ playbackTimeMs
      let best: number | null = null;
      for (let i = data.timestampsMs.length - 1; i >= 0; i--) {
        if (data.timestampsMs[i] <= playbackTimeMs && data.loadedFrames.has(i)) {
          best = i;
          break;
        }
      }
      if (best !== null) {
        w.apply_frame(layerId, data.files[best]);
        data.currentFrameIndex = best;
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
    // speed 1× = 1 radar-minute per real-second
    // simulated ms advanced per TICK_MS of real time:
    const simMsPerTick = speed * 60_000 * (TICK_MS / 1_000);
    timerRef.current = setInterval(() => {
      const s = stateRef.current;
      if (!s.ready) return;

      let next = s.playbackTimeMs + simMsPerTick;
      if (next > s.windowEndMs) {
        if (s.loop) {
          next = s.windowStartMs;
        } else {
          stopTimer();
          setState((p) => ({ ...p, playing: false }));
          return;
        }
      }
      applyFrameAtTime(next);
      setState((p) => ({ ...p, playbackTimeMs: next }));
    }, TICK_MS);
  }

  // ── Public controls ───────────────────────────────────────────────────────

  const play = useCallback(() => {
    setState((s) => {
      if (!s.ready) return s;
      // If already at the end and not looping, rewind to start
      let startTime = s.playbackTimeMs;
      if (startTime >= s.windowEndMs && !s.loop) {
        startTime = s.windowStartMs;
        applyFrameAtTime(startTime);
      }
      startTimer(s.speed);
      return { ...s, playing: true, playbackTimeMs: startTime };
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

  const stepForward = useCallback(() => {
    const s = stateRef.current;
    if (!s.ready) return;
    // Advance to the next timestamp in the union that is after current playback time
    const next = s.allTimestampsMs.find((ts) => ts > s.playbackTimeMs) ?? null;
    if (next === null) return;
    applyFrameAtTime(next);
    setState((p) => ({ ...p, playbackTimeMs: next }));
  }, []);

  const stepBack = useCallback(() => {
    const s = stateRef.current;
    if (!s.ready) return;
    // Find the latest timestamp strictly before current playback time
    let prev: number | null = null;
    for (let i = s.allTimestampsMs.length - 1; i >= 0; i--) {
      if (s.allTimestampsMs[i] < s.playbackTimeMs) {
        prev = s.allTimestampsMs[i];
        break;
      }
    }
    if (prev === null) return;
    applyFrameAtTime(prev);
    setState((p) => ({ ...p, playbackTimeMs: prev! }));
  }, []);

  const seekToTime = useCallback((ms: number) => {
    const s = stateRef.current;
    const clamped = Math.max(s.windowStartMs, Math.min(s.windowEndMs, ms));
    applyFrameAtTime(clamped);
    setState((p) => ({ ...p, playbackTimeMs: clamped }));
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
   * Initialize or re-initialize a layer with a new site and/or end time.
   * Called when the user selects a site or changes the time window.
   */
  const initLayer = useCallback((
    layerId: string,
    siteId: string,
    endTime: Date = new Date(),
    windowMs: number = WINDOW_MS,
  ) => {
    const w = wasmRef.current;
    if (!w) return;

    // Teardown existing data for this layer
    const existing = layerDataRef.current.get(layerId);
    if (existing) {
      w.clear_frame_cache(layerId);
    }

    const isPrimary =
      layerDataRef.current.size === 0 ||
      layerId === primaryIdRef.current ||
      primaryIdRef.current === null;
    if (isPrimary) primaryIdRef.current = layerId;

    stopTimer();

    const windowEndMs = endTime.getTime();
    const windowStartMs = windowEndMs - windowMs;

    const layerData: LayerData = {
      siteId,
      files: [],
      timestampsMs: [],
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
        playbackTimeMs: windowEndMs,
        windowStartMs,
        windowEndMs,
        allTimestampsMs: [],
        loadedTimestampsMs: new Set(),
        ready: false,
      }));
    }

    fetchFramesForWindow(w, siteId, windowStartMs, windowEndMs)
      .then(({ files, timestampsMs }) => {
        // Guard: if this layer was re-initialized before response arrived, discard
        const current = layerDataRef.current.get(layerId);
        if (!current || current.siteId !== siteId) return;

        const count = files.length;
        const latestIdx = count > 0 ? count - 1 : 0;

        current.files = files;
        current.timestampsMs = timestampsMs;
        current.currentFrameIndex = latestIdx;

        if (isPrimary) {
          setState((s) => ({
            ...s,
            allTimestampsMs: mergeAllTimestamps(),
            ready: count > 0,
          }));
        } else {
          setState((s) => ({
            ...s,
            allTimestampsMs: mergeAllTimestamps(),
          }));
        }

        if (count === 0) return;

        // Load the latest frame first (initial — creates mesh)
        workerFetch(files[latestIdx], siteId)
          .then((bytes) => {
            w.receive_radar_volume(layerId, files[latestIdx], siteId, bytes);
            const cur = layerDataRef.current.get(layerId);
            if (!cur || cur.siteId !== siteId) return;
            cur.initialLoaded = true;
            cur.loadedFrames.add(latestIdx);

            if (isPrimary) {
              setState((s) => {
                const loaded = new Set(s.loadedTimestampsMs);
                loaded.add(timestampsMs[latestIdx]);
                return { ...s, loadedTimestampsMs: loaded, ready: true };
              });
            }
          })
          .catch((err: unknown) => {
            console.error(`[useMultiLayerAnimation] initLayer(${layerId}) initial fetch failed:`, err);
          });

        // Prefetch remaining frames in the budget
        const prefetchStart = Math.max(0, count - INITIAL_FRAME_BUDGET);
        const indices: number[] = [];
        for (let i = prefetchStart; i < count; i++) {
          if (i !== latestIdx) indices.push(i);
        }

        for (const idx of indices) {
          workerFetch(files[idx], siteId)
            .then((bytes) => {
              w.cache_radar_frame(layerId, files[idx], bytes);
              const cur = layerDataRef.current.get(layerId);
              if (!cur || cur.siteId !== siteId) return;
              cur.loadedFrames.add(idx);

              if (isPrimary) {
                setState((s) => {
                  const loaded = new Set(s.loadedTimestampsMs);
                  loaded.add(cur.timestampsMs[idx]);
                  return { ...s, loadedTimestampsMs: loaded };
                });
              }
            })
            .catch(() => {
              // Skip failed frames silently
            });
        }
      })
      .catch((err: unknown) => {
        console.error(`[useMultiLayerAnimation] initLayer(${layerId}) frame list failed:`, err);
      });
  }, []);

  return {
    state,
    play,
    pause,
    togglePlay,
    stepForward,
    stepBack,
    seekToTime,
    setSpeed,
    cycleSpeed,
    setLoop,
    toggleLoop,
    initLayer,
  };
}
