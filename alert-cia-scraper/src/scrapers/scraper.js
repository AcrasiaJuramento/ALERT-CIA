import { ENABLED_SOURCES } from "../constants/sources.js";
import { classifyIncident, incidentTypeLabel } from "../lib/classify.js";
import { contentHash, extractStructuredAccidentDetails, extractVictimCount, incidentKey } from "../lib/deduplication.js";
import { discoverArticleLinks } from "../lib/discoverLinks.js";
import { extractArticle } from "../lib/extractArticle.js";
import { diffFetchMetrics, fetchHTMLBatch, getFetchMetrics } from "../lib/fetchHTML.js";
import { isAccidentRelevant } from "../lib/filters.js";
import { geocode } from "../lib/geocode.js";
import { extractLocation, isValidLocation } from "../lib/locations.js";
import { startScraperProgress, updateScraperProgress } from "../lib/progress.js";
import { findExistingSourceUrls, getScraperSourceHealthSnapshot } from "../lib/scraperStore.js";
import { normalizeUrl } from "../lib/urls.js";

const DEFAULT_ARTICLE_CONCURRENCY = 8;
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_DOMAIN_DELAY_MS = 125;
const runtimeEnv = globalThis.process?.env || {};

function envNumber(name, fallback, { min = 1, max = 60_000 } = {}) {
  const parsed = Number(runtimeEnv[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function scraperFetchOptions(mode) {
  return {
    timeoutMs: envNumber("SCRAPER_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, { min: 3000, max: 30000 }),
    domainDelayMs: envNumber("SCRAPER_DOMAIN_DELAY_MS", DEFAULT_DOMAIN_DELAY_MS, { min: 0, max: 2000 }),
    cacheTtlMs: mode === "full" ? 60 * 60 * 1000 : 15 * 60 * 1000,
  };
}

function dateValue(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function incrementalCutoff(sourceSnapshot) {
  return sourceSnapshot?.last_success_at || sourceSnapshot?.last_scraped_at || null;
}

function isOlderThanCutoff(articleDate, cutoff) {
  const articleTime = dateValue(articleDate);
  const cutoffTime = dateValue(cutoff);
  return articleTime && cutoffTime && articleTime <= cutoffTime;
}

function isOutsideDateRange(articleDate, days) {
  if (!days) return false;
  const articleTime = dateValue(articleDate);
  if (!articleTime) return false;
  return Date.now() - articleTime > days * 24 * 60 * 60 * 1000;
}

async function processSource(source, mode, stats, seenUrls, pageRange = {}, sourceSnapshot = null) {
  const beforeFetch = getFetchMetrics();
  const sourceHealth = {
    source_key: source.key,
    source_name: source.name,
    loading_strategy: source.loadingStrategy || source.paginationType || "pagination",
    pages_checked: 0,
    links_found: 0,
    new_links: 0,
    skipped_existing: 0,
    articles_processed: 0,
    incidents_detected: 0,
    rejected_count: 0,
    duplicate_count: 0,
    failed_count: 0,
    cache_hits: 0,
    retries: 0,
    status: "unknown",
    last_error: null,
  };
  const discovery = await discoverArticleLinks(source, mode, stats, sourceHealth, pageRange);
  sourceHealth.discovery_pages = discovery.pages || [];
  if (discovery.browserUnavailable) sourceHealth.browser_scroll_unavailable = true;
  const listLinks = discovery.links || [];
  const normalizedLinks = listLinks.map((url) => normalizeUrl(url)).filter(Boolean)
    .filter((url) => !seenUrls.has(url));
  normalizedLinks.forEach((url) => seenUrls.add(url));

  const existing = await findExistingSourceUrls(normalizedLinks);
  stats.duplicates_skipped += existing.size;
  sourceHealth.duplicate_count += existing.size;
  sourceHealth.skipped_existing = existing.size;
  const rejected = [...existing].map((url) => ({
    source_url: url,
    source_site: source.key,
    source_name: source.name,
    rejection_reason: "duplicate",
    rejection_details: "Exact source URL already exists before article download.",
  }));
  // Full mode re-fetches known URLs so improved extraction can repair stored mappings.
  const pending = mode === "full" ? normalizedLinks : normalizedLinks.filter((url) => !existing.has(url));
  sourceHealth.new_links = pending.length;
  console.info("[alert-cia-scraper] source discovery", {
    source: source.key,
    strategy: sourceHealth.loading_strategy,
    discovered: listLinks.length,
    unique: normalizedLinks.length,
    duplicates: existing.size,
    pending: pending.length,
    pages: sourceHealth.pages_checked,
  });
  updateScraperProgress({ phase: "downloading_articles", article: 0, articles_total: pending.length });
  const pages = await fetchHTMLBatch(pending, {
    ...scraperFetchOptions(mode),
    concurrency: envNumber("SCRAPER_ARTICLE_CONCURRENCY", DEFAULT_ARTICLE_CONCURRENCY, { min: 1, max: 20 }),
  });
  const records = [];

  for (const [articleIndex, url] of pending.entries()) {
    updateScraperProgress({ phase: "processing_articles", article: articleIndex + 1, articles_total: pending.length });
    const html = pages.get(url);
    stats.articles_checked += 1;
    sourceHealth.articles_processed += 1;
    if (!html) {
      stats.failed_urls.push(url);
      sourceHealth.failed_count += 1;
      sourceHealth.last_error = `Unable to download article ${url}`;
      rejected.push({
        source_url: url,
        source_site: source.key,
        source_name: source.name,
        rejection_reason: "fetch_failed",
        rejection_details: "Article HTML could not be downloaded.",
      });
      continue;
    }
    const article = extractArticle(html, url);
    const sourceUrl = normalizeUrl(article.canonical_url || url);
    if (!sourceUrl || seenUrls.has(`${sourceUrl}:canonical`)) {
      rejected.push({
        source_url: sourceUrl || url,
        source_site: source.key,
        source_name: source.name,
        title: article.title,
        snippet: article.snippet,
        published_at: article.published_at,
        rejection_reason: "duplicate",
        rejection_details: "Canonical article URL was already processed in this run.",
      });
      continue;
    }
    seenUrls.add(`${sourceUrl}:canonical`);
    const combined = `${article.title || ""}\n${article.snippet || ""}\n${article.body || ""}`;
    const articleHash = contentHash(combined);
    const classification = classifyIncident(combined);
    const location = extractLocation(article.title, article.snippet, article.body);
    const reject = (reason, details) => rejected.push({
      title: article.title,
      snippet: article.snippet,
      source_url: sourceUrl,
      source_site: source.key,
      source_name: source.name,
      published_at: article.published_at,
      detected_incident_type: classification.type,
      classification_confidence: classification.confidence,
      classification_score: classification.score,
      classification_reason: classification.reason,
      matched_terms: classification.matchedTerms,
      article_content_hash: articleHash,
      rejection_reason: reason,
      rejection_details: details,
      location,
      location_confidence: location?.confidence || {},
      raw_location_text: location?.rawLocationText || null,
      raw_payload: { article, classification, location },
    });

    if (!article.title) {
      reject("insufficient_information", "Article title could not be extracted.");
      continue;
    }
    if (mode !== "full" && isOlderThanCutoff(article.published_at, incrementalCutoff(sourceSnapshot))) {
      reject("outside_date_range", "Article is older than this source's last successful scraper run.");
      continue;
    }
    if (mode !== "full" && isOutsideDateRange(article.published_at, source.discoveryLimits?.articleDateRangeDays)) {
      reject("outside_date_range", `Article is older than the configured ${source.discoveryLimits.articleDateRangeDays}-day discovery range.`);
      continue;
    }
    if (!isAccidentRelevant(combined) && classification.type !== "vehicular") {
      reject(classification.type ? "non_vehicular" : "non_accident", "No reliable vehicular accident context was detected.");
      continue;
    }
    if (classification.type !== "vehicular") {
      reject("non_vehicular", `Classified as ${classification.type || "unknown"}.`);
      continue;
    }
    if (!classification.confidence || classification.confidence === "low") {
      reject("low_confidence", classification.reason);
      continue;
    }
    if (!location) {
      reject("location_unknown", "No Isabela location could be extracted from the accident context.");
      continue;
    }
    if (!isValidLocation(location)) {
      reject("outside_isabela", `Extracted location was outside Isabela or unsupported: ${location.locationText || "unknown"}.`);
      continue;
    }
    const geo = await geocode(location);
    const details = extractStructuredAccidentDetails(combined);
    const record = {
      title: article.title,
      snippet: article.snippet,
      body: article.body,
      source_url: sourceUrl,
      source_site: source.key,
      source_name: source.name,
      incident_type: classification.type,
      incident_type_key: classification.type,
      incident_type_label: incidentTypeLabel(classification.type),
      classification_confidence: classification.confidence,
      classification_score: classification.score,
      classification_reason: classification.reason,
      matched_terms: classification.matchedTerms,
      article_content_hash: articleHash,
      location,
      location_text: location.locationText,
      location_confidence: {
        ...(location.confidence || {}),
        coordinates: geo.geocode_confidence || 0,
      },
      published_at: article.published_at || new Date().toISOString(),
      victim_count: extractVictimCount(combined),
      vehicle_types: details.vehicleTypes,
      injured_count: details.injuredCount,
      fatality_count: details.fatalityCount,
      involved_parties: details.involvedParties,
      lat: geo.lat,
      lon: geo.lon,
      display_name: geo.display_name,
      geocoded_from: geo.geocoded_from,
      geocode_status: geo.geocode_status,
      geocode_precision: geo.geocode_precision,
      geocode_confidence: geo.geocode_confidence,
    };
    record.incident_key = incidentKey(record);
    records.push(record);
    sourceHealth.incidents_detected += 1;
  }
  sourceHealth.rejected_count = rejected.length;
  const fetchDiff = diffFetchMetrics(beforeFetch, getFetchMetrics());
  sourceHealth.cache_hits = fetchDiff.cacheHits;
  sourceHealth.retries = fetchDiff.retries;
  sourceHealth.failed_count += fetchDiff.failures;
  sourceHealth.status = sourceHealth.failed_count && !sourceHealth.links_found
    ? "failed"
    : !sourceHealth.incidents_detected && sourceHealth.rejected_count
      ? "warning"
      : "healthy";
  return { records, rejected, health: sourceHealth };
}

export async function scrapeSources({ mode = "update", sourceKey = null, pageFrom = 1, pageTo = null } = {}) {
  const safeMode = mode === "full" ? "full" : "update";
  const targetSources = sourceKey
    ? ENABLED_SOURCES.filter((source) => source.key === sourceKey)
    : ENABLED_SOURCES;
  const stats = {
    sources_checked: 0,
    pages_checked: 0,
    articles_checked: 0,
    duplicates_skipped: 0,
    failed_urls: [],
  };
  const records = [];
  const rejected = [];
  const sourceHealth = [];
  const seenUrls = new Set();
  const sourceSnapshots = await getScraperSourceHealthSnapshot(targetSources.map((source) => source.key)).catch(() => new Map());
  startScraperProgress({ mode: safeMode, sourcesTotal: targetSources.length });

  for (const [sourceIndex, source] of targetSources.entries()) {
    stats.sources_checked += 1;
    updateScraperProgress({
      phase: "pages",
      source_key: source.key,
      source_name: source.name,
      source_index: sourceIndex + 1,
      sources_total: targetSources.length,
      page: 0,
      max_pages: safeMode === "full" ? source.maxPagesFull : source.maxPagesUpdate,
      page_url: source.firstPageUrl,
      article: 0,
      articles_total: 0,
    });
    try {
      const result = await processSource(source, safeMode, stats, seenUrls, { pageFrom, pageTo }, sourceSnapshots.get(source.key));
      records.push(...result.records);
      rejected.push(...result.rejected);
      sourceHealth.push(result.health);
    } catch (error) {
      stats.failed_urls.push(`${source.key}: ${error.message}`);
      sourceHealth.push({
        source_key: source.key,
        source_name: source.name,
        pages_checked: 0,
        links_found: 0,
        articles_processed: 0,
        incidents_detected: 0,
        rejected_count: 1,
        duplicate_count: 0,
        failed_count: 1,
        cache_hits: 0,
        retries: 0,
        status: "failed",
        last_error: error.message,
      });
      rejected.push({
        source_url: source.firstPageUrl,
        source_site: source.key,
        source_name: source.name,
        rejection_reason: "extract_failed",
        rejection_details: error.message,
      });
    }
  }
  updateScraperProgress({ phase: "saving", page_url: null, article: 0, articles_total: records.length });
  return { mode: safeMode, source_key: sourceKey, page_from: pageFrom, page_to: pageTo, records, rejected, sourceHealth, stats };
}

// Compatibility export for callers from the original one-source scraper.
export async function scrapeBombo(options = {}) {
  return (await scrapeSources(options)).records;
}
