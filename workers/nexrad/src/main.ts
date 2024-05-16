import { Level2Radar } from "nexrad-level-2-data";
import * as AWS from "@aws-sdk/client-s3";
import qs from "qs";

const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
};

const s3BucketBaseUrl = "https://noaa-nexrad-level2.s3.amazonaws.com";

const fetchWithCache = async (url: string, env: Env): Promise<ArrayBuffer> => {
  let body = await env.cache.get(url, "arrayBuffer");
  if (!body) {
    console.log("cache miss", url);
    body = await fetch(url).then((res) => res.arrayBuffer());
    await env.cache.put(url, body!);
  } else {
    console.log("cache hit", url);
  }

  return body!;
};

const listFiles = async (
  date: string,
  radar: string,
  env: Env
): Promise<string[]> => {
  const s3 = new AWS.S3({
    region: "us-east-1",
    signer: { sign: async (request) => request },
  });

  const res = await s3.listObjectsV2({
    Bucket: "noaa-nexrad-level2",
    Prefix: `${date}/${radar}`,
    MaxKeys: 1000,
  });

  const keys = res.Contents?.map((it) => `${it.Key}`);
  return keys || [];
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const params = URL.parse(request.url)!.searchParams;
    const frameIndex = parseInt(params.get("frame") || "0");
    const radarName = params.get("radar") || "KHTX";
    const date = params.get("date") || "2024/05/16";

    const files = await listFiles(date, radarName, env);
    const frame = files.slice(frameIndex, frameIndex + 1);

    const cacheKey = `${frame}-ref-v2`;
    const cachedResult = await env.cache.get(cacheKey);
    if (cachedResult) {
      console.log(`response cache hit ${cacheKey}`);
      return Response.json(JSON.parse(cachedResult), { headers });
    }

    const rawData = await fetchWithCache(`${s3BucketBaseUrl}/${frame}`, env);
    const radar = new Level2Radar(Buffer.from(rawData));

    const azs = radar.getAzimuth();
    const rays: any[] = radar.getHighresReflectivity();

    rays.forEach((ray, i) => {
      ray.azimuth = azs[i];
    });

    const output = {
      rays,
      azs,
    };

    await env.cache.put(cacheKey, JSON.stringify(output));
    return Response.json(output, {
      headers: headers,
    });
  },
};
