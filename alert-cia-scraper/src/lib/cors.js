const localDevelopmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function configuredOrigins() {
  const values = String(process.env.SCRAPER_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") values.push(...localDevelopmentOrigins);
  return new Set(values);
}

export function getCorsHeaders(request, methods = "GET, OPTIONS") {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const requestOrigin = new URL(request.url).origin;
  const originAllowed = origin && (origin === requestOrigin || configuredOrigins().has(origin));
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": methods,
    "Cache-Control": "no-store",
    Vary: "Origin",
  };

  if (originAllowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

