import { scrapeBombo } from "@/scrapers/scraper";
import { getCachedData, saveCache } from "@/lib/cache";

export const runtime = "nodejs";

// ---------------- INCIDENT FILTER (ONLY NON-VEHICULAR) ---------------- //
function isGeneralIncident(text) {
  const low = text.toLowerCase();

  const keywords = [
    // crimes
    "robbery",
    "hold-up",
    "theft",
    "stolen",

    // fire
    "fire",
    "blaze",

    // disasters
    "flood",
    "flash flood",
    "earthquake",
    "tremor",
    "landslide",
    "slope failure",

  ];

  return keywords.some((w) => low.includes(w));
}

// ---------------- MAIN API ---------------- //
export async function GET() {
  // 1. CHECK CACHE FIRST
  const cached = getCachedData();

  if (cached?.incidents) {
    return Response.json({
      success: true,
      cached: true,
      type: "incidents",
      count: cached.incidents.length,
      data: cached.incidents,
    });
  }

  // 2. SCRAPE DATA
  const data = await scrapeBombo();

  // 3. FILTER ONLY GENERAL INCIDENTS (NO VEHICULAR)
  const incidents = data.filter((item) =>
    isGeneralIncident(`${item.title || ""} ${item.snippet || ""}`)
  );

  // 5. SAVE BOTH INTO CACHE
  saveCache({
    incidents,
  });

  // 6. RETURN RESPONSE
  return Response.json({
    success: true,
    cached: false,
    type: "incidents",
    count: incidents.length,
    data: incidents,
    fetched_at: new Date().toISOString(),
  });
}