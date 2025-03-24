import RadarService, { NOAA_LEVEL2_BUCKET, fetchWithCache } from "./service";

const corsHeaders = (request: Request): Record<string, string> => ({
  "access-control-allow-origin": request.headers.get("origin") as string,
  "access-control-allow-headers": request.headers.get(
    "Access-Control-Request-Headers"
  ) as string,
});

const cors = async (request: Request): Promise<Response> =>
  new Response(null, {
    headers: corsHeaders(request),
  });

const proxyRoute = async (request: Request, env: Env): Promise<Response> => {
  const match = request.url.match(/s3\/(?<bucket>[^/]+)\/(?<rest>.*)/);
  if (!match) return Response.json("error");

  const { bucket, rest } = match.groups;
  console.log(bucket, rest);

  const res = await fetchWithCache(
    `https://${bucket}.s3.amazonaws.com/${rest}`,
    env.cache
  );

  return new Response(res, {
    headers: corsHeaders(request),
  });
};

const radarRoute = async (request: Request, env: Env): Promise<Response> => {
  const params = URL.parse(request.url)!.searchParams;
  const frameIndex = parseInt(params.get("frame") || "0");
  const radarName = params.get("radar") || "KHTX";
  const date = params.get("date") || "2024/05/16";

  console.log(date, radarName, frameIndex);
  const service = new RadarService(NOAA_LEVEL2_BUCKET, env.cache);

  const output = await service.getRadialData(date, radarName, frameIndex);
  return Response.json(output, {
    headers: corsHeaders(request),
  });
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    console.log(request.method);

    // CORS
    if (request.method === "OPTIONS") return cors(request);

    const s3 = request.url.indexOf("s3") >= 0;
    if (s3) return proxyRoute(request, env);

    return radarRoute(request, env);
  },
};
