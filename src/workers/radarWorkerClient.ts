/**
 * Shared radar fetch worker instance.
 *
 * Both the animation system (useMultiLayerAnimation) and the live radar plugin
 * share this single worker. The worker handles archive fetch requests AND live
 * streaming.
 */

let _workerNextId = 0;
const _workerPending = new Map<
  number,
  { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }
>();

// Live scan listeners: layerId → callback
const _liveScanListeners = new Map<string, (bytes: Uint8Array, nextUpdateMs: number) => void>();
const _liveErrorListeners = new Map<string, () => void>();

export const radarWorker = new Worker(
  new URL("./radarFetchWorker.ts", import.meta.url),
  { type: "module" },
);

radarWorker.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case "result":
    case "error": {
      const p = _workerPending.get(msg.id);
      if (!p) return;
      _workerPending.delete(msg.id);
      if (msg.type === "result") p.resolve(msg.bytes as Uint8Array);
      else p.reject(new Error(msg.message as string));
      break;
    }

    case "liveScan": {
      const listener = _liveScanListeners.get(msg.layerId);
      listener?.(msg.bytes as Uint8Array, msg.nextUpdateMs as number);
      break;
    }

    case "liveStreamError": {
      const errListener = _liveErrorListeners.get(msg.layerId);
      errListener?.();
      break;
    }
  }
};

/** Fetch and parse an archive radar file via the worker. */
export function workerFetch(key: string, siteId: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = _workerNextId++;
    _workerPending.set(id, { resolve, reject });
    radarWorker.postMessage({ type: "fetch", id, key, siteId });
  });
}

/** Start a live stream for a layer. */
export function startLiveStream(
  layerId: string,
  site: string,
  tiltIndex: number,
  onScan: (bytes: Uint8Array, nextUpdateMs: number) => void,
  onError?: () => void,
) {
  _liveScanListeners.set(layerId, onScan);
  if (onError) _liveErrorListeners.set(layerId, onError);
  radarWorker.postMessage({ type: "startLiveStream", layerId, site, tiltIndex });
}

/** Stop a live stream for a layer. */
export function stopLiveStream(layerId: string) {
  _liveScanListeners.delete(layerId);
  _liveErrorListeners.delete(layerId);
  radarWorker.postMessage({ type: "stopLiveStream", layerId });
}
