import { getCorsHeaders } from "../alert-cia-scraper/src/lib/cors.js";
import { getScraperProgress } from "../alert-cia-scraper/src/lib/progress.js";

function requestShim(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  return {
    url: new URL(req.url || "/api/status", `${protocol}://${host}`).toString(),
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

export default function handler(req, res) {
  const headers = getCorsHeaders(requestShim(req));

  if (req.method === "OPTIONS") {
    applyHeaders(res, headers);
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    applyHeaders(res, headers);
    res.status(405).json({ success: false, error: "Method not allowed." });
    return;
  }

  applyHeaders(res, headers);
  res.status(200).json({ success: true, progress: getScraperProgress() });
}
