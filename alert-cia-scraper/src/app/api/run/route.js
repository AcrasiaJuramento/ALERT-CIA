import { requireAuthorizedScraperUser } from "@/lib/auth";
import { runScraper } from "@/lib/runScraper";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getEndpointType(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  return ["vehicular"].includes(type) ? type : "all";
  // "all", "incidents", 
}

function isCronAuthorized(request) {
  const secret = process.env.SCRAPER_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-scraper-cron-secret") === secret;
}

async function handleRun(request, { allowCron = false } = {}) {
  if (allowCron && isCronAuthorized(request)) {
    const result = await runScraper({ endpointType: getEndpointType(request) });
    return Response.json(
      { ...result, triggeredBy: "cron" },
      {
        headers: corsHeaders,
      }
    );
  }

  const auth = await requireAuthorizedScraperUser(request);
  if (!auth.authorized) {
    return Response.json(
      { success: false, error: auth.message },
      {
        status: auth.status,
        headers: corsHeaders,
      }
    );
  }

  const result = await runScraper({ endpointType: getEndpointType(request) });
  return Response.json(
    {
      ...result,
      triggeredBy: "user",
      userId: auth.user.id,
    },
    {
      headers: corsHeaders,
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request) {
  try {
    return await handleRun(request);
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

export async function GET(request) {
  try {
    return await handleRun(request, { allowCron: true });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
