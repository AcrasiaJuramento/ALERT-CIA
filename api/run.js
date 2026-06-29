import { requireAuthorizedScraperUser } from "../alert-cia-scraper/src/lib/auth.js";
import { getCorsHeaders } from "../alert-cia-scraper/src/lib/cors.js";
import { runScraper } from "../alert-cia-scraper/src/lib/runScraper.js";

const runtimeEnv = globalThis.process?.env || {};

export const config = {
  maxDuration: 300,
};

function requestShim(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  return {
    url: new URL(req.url || "/api/run", `${protocol}://${host}`).toString(),
    headers: {
      get(name) {
        const value = req.headers[String(name).toLowerCase()];
        return Array.isArray(value) ? value.join(", ") : value || null;
      },
    },
  };
}

function applyHeaders(res, headers) {
  Object.entries(headers || {}).forEach(([key, value]) => res.setHeader(key, value));
}

function getEndpointType(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "vehicular";
  return ["incidents", "vehicular"].includes(type) ? type : "vehicular";
}

function getMode(request, { cron = false } = {}) {
  if (cron) return "update";
  const { searchParams } = new URL(request.url);
  return searchParams.get("mode") === "full" ? "full" : "update";
}

function getSourceKey(request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("source") || searchParams.get("sourceKey") || null;
}

function isCronAuthorized(request) {
  const secret = runtimeEnv.CRON_SECRET || runtimeEnv.SCRAPER_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-scraper-cron-secret") === secret;
}

async function handleRun(req, res, { allowCron = false } = {}) {
  const request = requestShim(req);
  const headers = getCorsHeaders(request, "GET, POST, OPTIONS");
  applyHeaders(res, headers);

  if (allowCron && isCronAuthorized(request)) {
    const result = await runScraper({ endpointType: getEndpointType(request), mode: getMode(request, { cron: true }), sourceKey: getSourceKey(request) });
    res.status(200).json({ ...result, triggeredBy: "cron" });
    return;
  }

  const auth = await requireAuthorizedScraperUser(request);
  if (!auth.authorized) {
    res.status(auth.status).json({ success: false, error: auth.message });
    return;
  }

  const result = await runScraper({ endpointType: getEndpointType(request), mode: getMode(request), sourceKey: getSourceKey(request) });
  res.status(200).json({
    ...result,
    triggeredBy: "user",
    userId: auth.user.id,
  });
}

export default async function handler(req, res) {
  const request = requestShim(req);
  const headers = getCorsHeaders(request, "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    applyHeaders(res, headers);
    res.status(204).end();
    return;
  }

  if (!["GET", "POST"].includes(req.method)) {
    applyHeaders(res, headers);
    res.status(405).json({ success: false, error: "Method not allowed." });
    return;
  }

  try {
    await handleRun(req, res, { allowCron: req.method === "GET" });
  } catch (error) {
    applyHeaders(res, headers);
    res.status(500).json({ success: false, error: error.message });
  }
}
