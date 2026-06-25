import { scrapeBombo } from "@/scrapers/scraper";
import { getCachedData, saveCache } from "@/lib/cache";

export const runtime = "nodejs";

function isVehicular(text) {
  const low = text.toLowerCase();

  return [
    "motorcycle accident",
    "motorcycle crash",
    "vehicular accident",
    "road accident",
    "car crash",
    "truck accident",
    "collision",
    "crash",
    "overturned",
    "ran over",
  ].some((w) => low.includes(w));
}

function getVehicularSeverity(text) {
  const low = text.toLowerCase();

  if (
    /(killed|dead|died|fatal|fatality|fatalities)/i.test(low)
  ) {
    return "BLACK";
  }

  const injuredMatch = low.match(/(\d+)\s+(injured|hurt)/);

  if (injuredMatch) {
    const count = Number(injuredMatch[1]);

    if (count >= 5) return "RED";
    if (count >= 1) return "YELLOW";
  }

  if (
    low.includes("bus crash") ||
    low.includes("truck collision") ||
    low.includes("trapped") ||
    low.includes("pinned")
  ) {
    return "RED";
  }

  return "GREEN";
}

export async function GET() {
  // 1. CHECK CACHE FIRST
  const cached = getCachedData();

  if (cached?.vehicular) {
    return Response.json({
      success: true,
      cached: true,
      type: "vehicular",
      count: cached.vehicular.length,
      data: cached.vehicular,
    });
  }

  // 2. SCRAPE ONLY IF NO CACHE
  const data = await scrapeBombo();

  // 3. FILTER VEHICULAR
  const vehicular = data
  .filter((item) =>
    isVehicular(`${item.title || ""} ${item.snippet || ""}`)
  )
  .map((item) => ({
    ...item,
    severity: getVehicularSeverity(
      `${item.title || ""} ${item.snippet || ""}`
    ),
  }));

  // 4. ALSO BUILD INCIDENTS (so cache stays complete)
  const incidents = data;

  // 5. SAVE BOTH INTO JSON CACHE
  saveCache({
    vehicular
  });

  // 6. RETURN RESPONSE
  return Response.json({
    success: true,
    cached: false,
    type: "vehicular",
    count: vehicular.length,
    data: vehicular,
    fetched_at: new Date().toISOString(),
  });
}