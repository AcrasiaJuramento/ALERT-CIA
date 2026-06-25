import { requireAuthorizedScraperUser } from "@/lib/auth";
import { runScraper } from "@/lib/runScraper";

export const runtime = "nodejs";

function getEndpointType(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  return ["all", "incidents", "vehicular"].includes(type) ? type : "all";
}

function isCronAuthorized(request) {
  const secret = process.env.SCRAPER_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-scraper-cron-secret") === secret;
}

async function handleRun(request, { allowCron = false } = {}) {
  if (allowCron && isCronAuthorized(request)) {
    const result = await runScraper({ endpointType: getEndpointType(request) });
    return Response.json({ ...result, triggeredBy: "cron" });
  }

  const auth = await requireAuthorizedScraperUser(request);
  if (!auth.authorized) {
    return Response.json({ success: false, error: auth.message }, { status: auth.status });
  }

  const result = await runScraper({ endpointType: getEndpointType(request) });
  return Response.json({ ...result, triggeredBy: "user", userId: auth.user.id });
}

export async function POST(request) {
  try {
    return await handleRun(request);
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    return await handleRun(request, { allowCron: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
