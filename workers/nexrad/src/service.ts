import { Level2Radar } from "nexrad-level-2-data";
import * as AWS from "@aws-sdk/client-s3";
import { ListObjectsV2Output } from "@aws-sdk/client-s3";

export const NOAA_LEVEL2_BUCKET = "https://noaa-nexrad-level2.s3.amazonaws.com";

export default class RadarService {
  constructor(
    private readonly baseUrl: string = NOAA_LEVEL2_BUCKET,
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
      async () => await fetchWithCache(`${this.baseUrl}/${frame}`, cache)
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

  private readonly s3 = new AWS.S3({
    region: "us-east-1",
    signer: { sign: async (request) => request },
    endpoint: "http://localhost:8787/s3",
    forcePathStyle: true,
  });

  async listRadarFiles(date: string, radar: string): Promise<string[]> {
    const cacheKey = `${date}-${radar}-v6`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log("list cache hit:", cacheKey);
      return JSON.parse(cached);
    }

    let contents: ListObjectsV2Output["Contents"] = [];
    let continuationToken: string | undefined;

    do {
      const res = await this.s3.listObjectsV2({
        Bucket: "noaa-nexrad-level2",
        Prefix: `${date}/${radar}`,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      });

      continuationToken = res.ContinuationToken;
      contents.push(...(res.Contents || []));
    } while (continuationToken != null);

    const keys = contents
      .sort((a, b) => {
        return b.LastModified!.getTime() - a.LastModified!.getTime();
      })
      .map((it) => `${it.Key}`);

    await this.cache.put(cacheKey, JSON.stringify(keys), {
      expirationTtl: 60,
    });

    return keys || [];
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
