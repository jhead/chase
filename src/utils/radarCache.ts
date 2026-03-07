import { RadarSite } from "../components/ChaserMap";

type RadarCacheKey = {
  radarSite: RadarSite;
  date: string;
};

type RadarCacheEntry = {
  frames: Float32Array[];
  lastUpdated: number;
  frameIndices: number[];
};

class RadarCache {
  private cache: Map<string, RadarCacheEntry> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private getKey(key: RadarCacheKey): string {
    return `${key.radarSite.id}-${key.date}`;
  }

  get(key: RadarCacheKey): RadarCacheEntry | null {
    const cacheKey = this.getKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.lastUpdated > this.CACHE_DURATION) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry;
  }

  set(key: RadarCacheKey, frames: Float32Array[], frameIndices: number[]): void {
    const cacheKey = this.getKey(key);
    this.cache.set(cacheKey, {
      frames,
      lastUpdated: Date.now(),
      frameIndices,
    });
  }

  update(
    key: RadarCacheKey,
    newFrames: Float32Array[],
    newFrameIndices: number[]
  ): void {
    const cacheKey = this.getKey(key);
    const existing = this.cache.get(cacheKey);

    if (!existing) {
      this.set(key, newFrames, newFrameIndices);
      return;
    }

    // Merge new frames with existing ones, avoiding duplicates
    const existingFrameIndices = new Set(existing.frameIndices);
    const newFramesToAdd: Float32Array[] = [];
    const newIndicesToAdd: number[] = [];

    newFrameIndices.forEach((index, i) => {
      if (!existingFrameIndices.has(index)) {
        newFramesToAdd.push(newFrames[i]);
        newIndicesToAdd.push(index);
      }
    });

    if (newFramesToAdd.length > 0) {
      this.cache.set(cacheKey, {
        frames: [...existing.frames, ...newFramesToAdd],
        lastUpdated: Date.now(),
        frameIndices: [...existing.frameIndices, ...newIndicesToAdd],
      });
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const radarCache = new RadarCache();
