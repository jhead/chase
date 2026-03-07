import { Level2Radar } from "nexrad-level-2-data";

export const NOAA_LEVEL2_BUCKET = "unidata-nexrad-level2";

export default class RadarService {
  constructor(
    private readonly bucket: string = NOAA_LEVEL2_BUCKET,
    private readonly cache: Cache = NoCache
  ) {}

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
          `http://localhost:8787/s3/${this.bucket}/${frame}`,
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

  async listRadarFiles(date: string, radar: string): Promise<string[]> {
    const cacheKey = `${date}-${radar}-v6`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log("list cache hit:", cacheKey);
      return JSON.parse(cached);
    }

    const prefix = `${date}/${radar}`;
    const url = `http://localhost:8787/s3/${this.bucket}/?list-type=2&prefix=${prefix}&max-keys=1000`;
    const res = await fetch(url);
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
