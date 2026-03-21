/// <reference lib="webworker" />
// With --target bundler, WASM initialises synchronously on import.
import { fetch_and_parse, start_live_stream } from "../wasm-worker/radish_worker.js";

// Parsed-volume cache: S3 key → postcard bytes.
// Bytes are stored until claimed by the main thread (transferred zero-copy).
const cache = new Map<string, Uint8Array>();

// Live stream stop flags: layer_id → { stopped: boolean }
const liveStreams = new Map<string, { stopped: boolean }>();

self.postMessage({ type: "ready" });

type FetchRequest = { type: "fetch"; id: number; key: string; siteId: string };
type StartLiveStream = {
  type: "startLiveStream";
  layerId: string;
  site: string;
  tiltIndex: number;
};
type StopLiveStream = { type: "stopLiveStream"; layerId: string };

type WorkerMessage = FetchRequest | StartLiveStream | StopLiveStream;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case "fetch": {
      const { id, key, siteId } = msg;

      const cached = cache.get(key);
      if (cached) {
        cache.delete(key);
        self.postMessage({ type: "result", id, bytes: cached }, [cached.buffer]);
        return;
      }

      try {
        const bytes = (await fetch_and_parse(key, siteId)) as Uint8Array;
        // Slice to detach from WASM linear memory before transferring
        const copy = bytes.slice();
        self.postMessage({ type: "result", id, bytes: copy }, [copy.buffer]);
      } catch (err) {
        self.postMessage({ type: "error", id, message: String(err) });
      }
      break;
    }

    case "startLiveStream": {
      const { layerId, site, tiltIndex } = msg;

      // Stop any existing stream for this layer
      const existing = liveStreams.get(layerId);
      if (existing) {
        existing.stopped = true;
      }

      // Create stop flag for this stream
      const streamState = { stopped: false };
      liveStreams.set(layerId, streamState);

      // Start the Rust streaming loop
      start_live_stream(
        site,
        tiltIndex,
        (returnedLayerId: string, bytes: Uint8Array | null, nextUpdateMs: number) => {
          if (bytes === null) {
            // Error or stream ended
            self.postMessage({ type: "liveStreamError", layerId: returnedLayerId });
            return;
          }
          // Slice to detach from WASM linear memory before transferring
          const copy = bytes.slice();
          self.postMessage(
            { type: "liveScan", layerId: returnedLayerId, bytes: copy, nextUpdateMs },
            [copy.buffer],
          );
        },
        layerId,
        () => streamState.stopped,
      );
      break;
    }

    case "stopLiveStream": {
      const { layerId } = msg;
      const stream = liveStreams.get(layerId);
      if (stream) {
        stream.stopped = true;
        liveStreams.delete(layerId);
      }
      break;
    }
  }
};
