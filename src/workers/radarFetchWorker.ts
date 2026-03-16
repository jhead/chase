// With --target bundler, WASM initialises synchronously on import.
import { fetch_and_parse } from "../wasm-worker/nexrad_worker.js";

// Parsed-volume cache: S3 key → postcard bytes.
// Bytes are stored until claimed by the main thread (transferred zero-copy).
const cache = new Map<string, Uint8Array>();

self.postMessage({ type: "ready" });

type FetchRequest = { type: "fetch"; id: number; key: string; siteId: string };

self.onmessage = async (e: MessageEvent<FetchRequest>) => {
  const { id, type, key, siteId } = e.data;
  if (type !== "fetch") return;

  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    self.postMessage({ type: "result", id, bytes: cached }, [cached.buffer]);
    return;
  }

  try {
    const bytes = await fetch_and_parse(key, siteId) as Uint8Array;
    // Slice to detach from WASM linear memory before transferring
    const copy = bytes.slice();
    self.postMessage({ type: "result", id, bytes: copy }, [copy.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", id, message: String(err) });
  }
};
