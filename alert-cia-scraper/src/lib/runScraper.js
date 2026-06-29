import { saveCache } from "./cache.js";
import { getFetchMetrics, resetFetchMetrics } from "./fetchHTML.js";
import { getScrapedIncidentSnapshot, saveScrapedRecords } from "./scraperStore.js";
import { completeScraperProgress } from "./progress.js";
import { scrapeSources } from "../scrapers/scraper.js";

export async function runScraper({ mode = "update", endpointType = "all", sourceKey = null } = {}) {
  const safeMode = mode === "full" ? "full" : "update";
  resetFetchMetrics();
  const scraped = await scrapeSources({ mode: safeMode, sourceKey });
  const records = endpointType === "vehicular"
    ? scraped.records.filter((item) => item.incident_type_key === "vehicular")
    : scraped.records;
  const incidents = records.filter((item) => item.incident_type_key !== "vehicular");
  const vehicular = records.filter((item) => item.incident_type_key === "vehicular");
  const database = await saveScrapedRecords(records, { mode: safeMode, scrapeStats: scraped.stats });
  const snapshot = database.saved ? await getScrapedIncidentSnapshot() : null;
  if (snapshot) {
    saveCache({
      incidents: snapshot.filter((item) => item.incident_type_key !== "vehicular"),
      vehicular: snapshot.filter((item) => item.incident_type_key === "vehicular"),
    }, { replace: true });
  } else {
    // Never erase a useful cache merely because an update found no new articles.
    saveCache({ incidents, vehicular });
  }
  const fetchMetrics = getFetchMetrics();
  const failedRequests = Math.max(scraped.stats.failed_urls.length, fetchMetrics.failures);
  const data = records.map((record) => {
    const item = { ...record };
    delete item.body;
    delete item.location;
    return {
      ...item,
      municipality: record.location?.municipality || null,
      barangay: record.location?.barangay || null,
      road_place: record.location?.road || null,
    };
  });
  console.info("[alert-cia-scraper] run complete", {
    mode: safeMode,
    pages: scraped.stats.pages_checked,
    checked: scraped.stats.articles_checked,
    saved: database.newIncidents || 0,
    merged: database.mergedIncidents || 0,
    duplicates: scraped.stats.duplicates_skipped + (database.duplicates || 0),
    failed: failedRequests,
  });
  completeScraperProgress({ success: database.enabled ? database.saved : true, error: database.errors?.[0] || null });
  return {
    success: database.enabled ? database.saved : true,
    mode: safeMode,
    endpoint_type: endpointType,
    source_key: sourceKey,
    accident_only: true,
    fetched_at: new Date().toISOString(),
    sources_checked: scraped.stats.sources_checked,
    pages_checked: scraped.stats.pages_checked,
    articles_checked: scraped.stats.articles_checked,
    new_incidents: database.newIncidents || 0,
    merged_incidents: database.mergedIncidents || 0,
    duplicates_skipped: scraped.stats.duplicates_skipped + (database.duplicates || 0),
    failed_requests: failedRequests,
    data,
    database,
  };
}
