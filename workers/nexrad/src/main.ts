import RadarService, { NOAA_LEVEL2_BUCKET, fetchWithCache } from "./service";

const corsHeaders = (request: Request): Record<string, string> => ({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, OPTIONS",
});

const cors = async (request: Request): Promise<Response> =>
  new Response(null, {
    headers: corsHeaders(request),
  });

const proxyRoute = async (request: Request, env: Env): Promise<Response> => {
  const match = request.url.match(/s3\/(?<bucket>[^/]+)\/(?<rest>.*)/);
  if (!match?.groups)
    return Response.json({ error: "Invalid URL format" }, { status: 400 });

  const { bucket, rest } = match.groups;
  console.log("Proxying request to S3:", { bucket, rest });

  const url = `https://${bucket}.s3.amazonaws.com/${rest}`;
  console.log("Fetching from:", url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`S3 request failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.arrayBuffer();
    return new Response(data, {
      headers: {
        ...corsHeaders(request),
        "content-type":
          res.headers.get("content-type") || "application/octet-stream",
      },
    });
  } catch (error: unknown) {
    console.error("Error proxying to S3:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: errorMessage },
      {
        status: 500,
        headers: corsHeaders(request),
      }
    );
  }
};

const radarRoute = async (request: Request, env: Env): Promise<Response> => {
  const params = new URL(request.url).searchParams;
  const frameIndex = parseInt(params.get("frame") || "0");
  const radarName = params.get("radar") || "KHTX";
  const date = params.get("date") || "2024/05/16";
  const volume = params.get("volume") === "1";

  // Use request origin so worker's self-fetch (list + get file) works when deployed
  const baseUrl = new URL(request.url).origin;
  const service = new RadarService(NOAA_LEVEL2_BUCKET, env.cache, baseUrl);

  try {
    if (volume) {
      const output = await service.getVolumeData(date, radarName);
      return Response.json(output, { headers: corsHeaders(request) });
    }
    const output = await service.getRadialData(date, radarName, frameIndex);
    return Response.json(output, { headers: corsHeaders(request) });
  } catch (error: unknown) {
    console.error("Error processing radar request:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: errorMessage },
      { status: 500, headers: corsHeaders(request) }
    );
  }
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    console.log("Worker request:", request.method, request.url);

    // CORS
    if (request.method === "OPTIONS") return cors(request);

    const s3 = request.url.indexOf("s3") >= 0;
    if (s3) return proxyRoute(request, env);

    return radarRoute(request, env);
  },
};
