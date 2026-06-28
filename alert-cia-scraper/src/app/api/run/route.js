import { requireAuthorizedScraperUser } from "@/lib/auth";
import { getCorsHeaders } from "@/lib/cors";
import { runScraper } from "@/lib/runScraper";

export const runtime = "nodejs";
export const maxDuration = 300;

function getEndpointType(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  return ["incidents", "vehicular"].includes(type) ? type : "all";
}

function getMode(request, { cron = false } = {}) {
  if (cron) return "update";
  const { searchParams } = new URL(request.url);
  return searchParams.get("mode") === "full" ? "full" : "update";
}

function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET || process.env.SCRAPER_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-scraper-cron-secret") === secret;
}

async function handleRun(request, { allowCron = false } = {}) {
  const corsHeaders = getCorsHeaders(request, "GET, POST, OPTIONS");
  if (allowCron && isCronAuthorized(request)) {
    const result = await runScraper({ endpointType: getEndpointType(request), mode: getMode(request, { cron: true }) });
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

  const result = await runScraper({ endpointType: getEndpointType(request), mode: getMode(request) });
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

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, "GET, POST, OPTIONS"),
  });
}

export async function POST(request) {
  const corsHeaders = getCorsHeaders(request, "GET, POST, OPTIONS");
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
  const corsHeaders = getCorsHeaders(request, "GET, POST, OPTIONS");
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
