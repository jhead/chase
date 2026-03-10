import { Level2Radar } from "nexrad-level-2-data";

export const NOAA_LEVEL2_BUCKET = "unidata-nexrad-level2";

const DEFAULT_BASE_URL = "http://localhost:8787";

export default class RadarService {
  private readonly baseUrl: string;

  constructor(
    private readonly bucket: string = NOAA_LEVEL2_BUCKET,
    private readonly cache: Cache = NoCache,
    baseUrl: string = DEFAULT_BASE_URL
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getRadialData(
    date: string,
    radarName: string,
    frameIndex: number
  ): Promise<any> {
    const { cache } = this;

    const files = await measure("list", async () => {
      const files = await this.listRadarFiles(date, radarName);
      return files.filter((key) => key.endsWith("_V06"));
    });

    const frame = files.slice(frameIndex, frameIndex + 1)[0];

    if (!frame) {
      console.log(`skipped empty frame: ${frameIndex} (${files.length} total)`);
      return {};
    }

    const cacheKey = `${frame}-ref-v2`;
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      console.log(`response cache hit ${cacheKey}`);
      return JSON.parse(cachedResult);
    }

    const rawData = await measure(
      "fetch-frame",
      async () =>
        await fetchWithCache(
          `${this.baseUrl}/s3/${this.bucket}/${frame}`,
          cache
        )
    );

    const radar = measure("radar", () => new Level2Radar(Buffer.from(rawData)));
    const azs = measure("azimuth", () => radar.getAzimuth());
    const rays = measure("ref", () => radar.getHighresReflectivity()).map(
      (ray, i) => {
        return { ...ray, azimuth: azs[i] };
      }
    );

    const output = {
      rays,
      azs,
    };

    cache.put(cacheKey, JSON.stringify(output));
    return output;
  }

  /**
   * Fetch the latest volume file and return all elevation sweeps for the 3D Bevy viewer.
   * Each sweep: { elevation_angle, gate_size_m, first_gate_m, azimuths, reflectivity }.
   * reflectivity is Float32Array row-major, normalized 0–1 (dBZ/75).
   */
  async getVolumeData(date: string, radarName: string, maxTilts?: number): Promise<{
    site: string;
    sweeps: Array<{
      elevation_angle: number;
      gate_size_m: number;
      first_gate_m: number;
      azimuths: number[];
      reflectivity: number[];
    }>;
    debug?: string;
  }> {
    const files = await this.listRadarFiles(date, radarName);
    const v06 = files.filter((k) => k.endsWith("_V06"));
    const frame = v06[0];
    if (!frame) {
      return {
        site: radarName,
        sweeps: [],
        debug: `no V06 files (${files.length} total) for prefix ${date}/${radarName}`,
      };
    }

    const rawData = await fetchWithCache(
      `${this.baseUrl}/s3/${this.bucket}/${frame}`,
      this.cache
    );
    const radar = new Level2Radar(Buffer.from(rawData));
    const elevations = radar.listElevations();
    const sweeps: Array<{
      elevation_angle: number;
      gate_size_m: number;
      first_gate_m: number;
      azimuths: number[];
      reflectivity: number[];
    }> = [];

    for (const elevNum of elevations) {
      if (maxTilts !== undefined && sweeps.length >= maxTilts) break;

      radar.setElevation(elevNum);
      // getHighresReflectivity() returns HighResData[] (one object per ray),
      // not number[][]. Each HighResData has: gate_count, gate_size, first_gate, moment_data.
      const rays = radar.getHighresReflectivity() as any[];
      const azs = radar.getAzimuth() as number[];
      if (!rays?.length || !azs?.length) continue;

      const firstRay = rays[0];
      const numGates: number = firstRay?.gate_count ?? 0;
      if (numGates === 0) continue;

      const header = radar.getHeader(0) as { elevation_angle?: number } | undefined;
      const elevationAngle = header?.elevation_angle ?? elevNum * 0.5;

      // gate_size and first_gate are in km in nexrad-level-2-data — convert to meters.
      const gateSizeM: number = (firstRay?.gate_size ?? 0.25) * 1000;
      const firstGateM: number = (firstRay?.first_gate ?? 2.125) * 1000;

      const numRays = azs.length;

      // Sort rays by azimuth (matching the Rust parser) for consistent UV mapping.
      const rayOrder = Array.from({ length: numRays }, (_, i) => i)
        .sort((a, b) => azs[a] - azs[b]);
      const sortedAzs = rayOrder.map(i => azs[i]);
      const sortedRays = rayOrder.map(i => rays[i]);

      const reflectivity: number[] = [];
      for (let r = 0; r < numRays; r++) {
        const momentData: (number | null)[] = sortedRays[r]?.moment_data ?? [];
        for (let g = 0; g < numGates; g++) {
          const v = momentData[g];
          // moment_data values are already in dBZ; normalize 0–1 (75 dBZ = 1)
          reflectivity.push(
            v != null && typeof v === "number"
              ? Math.max(0, Math.min(1, v / 75))
              : 0
          );
        }
      }

      sweeps.push({
        elevation_angle: elevationAngle,
        gate_size_m: gateSizeM,
        first_gate_m: firstGateM,
        azimuths: sortedAzs,
        reflectivity,
      });
    }

    return { site: radarName, sweeps };
  }

  /**
   * Return sorted (ascending) V06 filenames with parsed timestamps for animation.
   */
  async getFrameList(
    date: string,
    radar: string
  ): Promise<{ files: string[]; timestamps: string[]; count: number }> {
    const allFiles = await this.listRadarFiles(date, radar);
    // listRadarFiles returns descending; filter to V06 and reverse to ascending
    const v06 = allFiles.filter((k) => k.endsWith("_V06")).reverse();
    const timestamps = v06.map((f) => {
      // Filename format: YYYY/MM/DD/SITE/SITE_YYYYMMDD_HHMMSS_V06
      const match = f.match(/(\d{8})_(\d{6})_V06$/);
      if (!match) return "";
      const time = match[2]; // HHMMSS
      return `${time.slice(0, 2)}:${time.slice(2, 4)}Z`;
    });
    return { files: v06, timestamps, count: v06.length };
  }

  async listRadarFiles(date: string, radar: string): Promise<string[]> {
    const cacheKey = `${date}-${radar}-v6`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log("list cache hit:", cacheKey);
      return JSON.parse(cached);
    }

    const prefix = `${date}/${radar}`;
    const url = `${this.baseUrl}/s3/${this.bucket}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `S3 list failed ${res.status}: ${body.slice(0, 200)}`
      );
    }

    const text = await res.text();

    const keys = [...text.matchAll(/<Key>([^<]+)<\/Key>/g)]
      .map((m) => m[1])
      .sort((a, b) => b.localeCompare(a));

    await this.cache.put(cacheKey, JSON.stringify(keys), {
      expirationTtl: 60,
    });

    return keys;
  }
}

export const fetchWithCache = async (
  url: string,
  cache: Cache
): Promise<ArrayBuffer> => {
  let body = await cache.get(url, "arrayBuffer");
  if (!body) {
    console.log("cache miss", url);
    body = await fetch(url).then((res) => res.arrayBuffer());
    await cache.put(url, body!);
  } else {
    console.log("cache hit", url, body.byteLength);
  }

  return body!;
};

type Cache = {
  get(key: string): Promise<any | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: any, options?: Record<string, any>): Promise<void>;
};

const NoCache: Cache = {
  get: async () => null,
  put: async () => {},
};

const measure = <T>(name: string, block: () => T): T => {
  const start = Date.now();
  const ret = block();

  const onComplete = () => {
    const elapsed = Date.now() - start;
    console.log(`(time) ${name}: ${elapsed}ms`);
  };

  if (ret instanceof Promise) {
    ret.then(onComplete);
  } else {
    onComplete();
  }

  return ret;
};
