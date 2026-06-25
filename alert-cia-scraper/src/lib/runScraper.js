import { scrapeBombo } from "@/scrapers/scraper";
import { saveCache } from "@/lib/cache";
import { saveScrapedBatch } from "@/lib/scraperStore";

export function isGeneralIncident(text) {
  const low = text.toLowerCase();
  return [
    "robbery",
    "hold-up",
    "theft",
    "stolen",
    "fire",
    "blaze",
    "flood",
    "flash flood",
    "earthquake",
    "tremor",
    "landslide",
    "slope failure",
  ].some((word) => low.includes(word));
}

export function isVehicular(text) {
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
  ].some((word) => low.includes(word));
}

export function getVehicularSeverity(text) {
  const low = text.toLowerCase();

  if (/(killed|dead|died|fatal|fatality|fatalities)/i.test(low)) return "BLACK";

  const injuredMatch = low.match(/(\d+)\s+(injured|hurt)/);
  if (injuredMatch) {
    const count = Number(injuredMatch[1]);
    if (count >= 5) return "RED";
    if (count >= 1) return "YELLOW";
  }

  if (low.includes("bus crash") || low.includes("truck collision") || low.includes("trapped") || low.includes("pinned")) {
    return "RED";
  }

  return "GREEN";
}

function classifyRecords(data = []) {
  const vehicular = data
    .filter((item) => isVehicular(`${item.title || ""} ${item.snippet || ""}`))
    .map((item) => ({
      ...item,
      incident_type: item.incident_type || "vehicular",
      severity: item.severity || getVehicularSeverity(`${item.title || ""} ${item.snippet || ""}`),
    }));

  const incidents = data.filter((item) => (
    !isVehicular(`${item.title || ""} ${item.snippet || ""}`) &&
    isGeneralIncident(`${item.title || ""} ${item.snippet || ""}`)
  ));

  return { incidents, vehicular };
}

export async function runScraper({ endpointType = "all" } = {}) {
  const data = await scrapeBombo();
  const classified = classifyRecords(data);
  const categories = endpointType === "all" ? ["incidents", "vehicular"] : [endpointType];

  saveCache({
    incidents: classified.incidents,
    vehicular: classified.vehicular,
  });

  const database = {};
  for (const category of categories) {
    database[category] = await saveScrapedBatch(category, classified[category] || []);
  }

  const totals = categories.reduce((acc, category) => {
    const result = database[category] || {};
    acc.fetched += classified[category]?.length || 0;
    acc.inserted += result.insertedCount || 0;
    acc.duplicates += result.duplicateCount || 0;
    acc.matched += result.matchedCount || 0;
    return acc;
  }, { fetched: 0, inserted: 0, duplicates: 0, matched: 0 });

  return {
    success: Object.values(database).every((result) => result.saved !== false),
    type: endpointType,
    count: totals.fetched,
    totals,
    data: endpointType === "all" ? classified : classified[endpointType],
    database,
    fetched_at: new Date().toISOString(),
  };
}
