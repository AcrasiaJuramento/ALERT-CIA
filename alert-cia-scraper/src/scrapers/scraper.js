import { ENABLED_SOURCES } from "../constants/sources.js";
import { classify, incidentTypeLabel } from "../lib/classify.js";
import { extractVictimCount, incidentKey } from "../lib/deduplication.js";
import { extractArticle } from "../lib/extractArticle.js";
import { extractLinks, extractNextPage } from "../lib/extractLinks.js";
import { fetchHTML, fetchHTMLBatch } from "../lib/fetchHTML.js";
import { isAccidentRelevant } from "../lib/filters.js";
import { geocode } from "../lib/geocode.js";
import { extractLocation, isValidLocation } from "../lib/locations.js";
import { startScraperProgress, updateScraperProgress } from "../lib/progress.js";
import { findExistingSourceUrls } from "../lib/scraperStore.js";
import { normalizeUrl } from "../lib/urls.js";

const UPDATE_DUPLICATE_THRESHOLD = 0.8;
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

async function listPages(source, mode, stats, { pageFrom = 1, pageTo = null } = {}) {
  const configuredMaxPages = mode === "full" ? source.maxPagesFull : source.maxPagesUpdate;
  const maxPages = Math.min(configuredMaxPages, pageTo || configuredMaxPages);
  const startPage = Math.max(1, Math.min(Number(pageFrom) || 1, maxPages));
  const links = new Set();
  let nextUrl = source.firstPageUrl;
  let detectedNextUrl = null;
  let duplicateHeavyPages = 0;
  const visitedPages = new Set();

  for (let page = startPage; page <= maxPages; page += 1) {
    const pageUrl = source.paginationType === "next_link" && page === 1
      ? nextUrl
      : detectedNextUrl || source.pageUrl(page);
    if (!pageUrl || visitedPages.has(pageUrl)) break;
    visitedPages.add(pageUrl);
    updateScraperProgress({ phase: "pages", page, max_pages: maxPages, page_url: pageUrl, article: 0, articles_total: 0 });
    const html = await fetchHTML(pageUrl, scraperFetchOptions(mode));
    stats.pages_checked += 1;
    if (!html) {
      stats.failed_urls.push(pageUrl);
      if (page === 1) break;
      continue;
    }

    const pageLinks = extractLinks(html, pageUrl, source);
    if (!pageLinks.length) break;
    const newOnPage = pageLinks.filter((url) => !links.has(url));
    if (!newOnPage.length) break;
    newOnPage.forEach((url) => links.add(url));

    if (mode === "update") {
      const existing = await findExistingSourceUrls(newOnPage);
      const ratio = existing.size / newOnPage.length;
      duplicateHeavyPages = ratio >= UPDATE_DUPLICATE_THRESHOLD ? duplicateHeavyPages + 1 : 0;
      if (duplicateHeavyPages >= 2) break;
    }

    detectedNextUrl = extractNextPage(html, pageUrl);
    if (source.paginationType === "next_link") {
      nextUrl = detectedNextUrl;
      if (!nextUrl) break;
    }
  }
  return [...links];
}

async function processSource(source, mode, stats, seenUrls, pageRange = {}) {
  const listLinks = await listPages(source, mode, stats, pageRange);
  const normalizedLinks = listLinks.map((url) => normalizeUrl(url)).filter(Boolean)
    .filter((url) => !seenUrls.has(url));
  normalizedLinks.forEach((url) => seenUrls.add(url));

  const existing = await findExistingSourceUrls(normalizedLinks);
  stats.duplicates_skipped += existing.size;
  // Full mode re-fetches known URLs so improved extraction can repair stored mappings.
  const pending = mode === "full" ? normalizedLinks : normalizedLinks.filter((url) => !existing.has(url));
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
    if (!html) { stats.failed_urls.push(url); continue; }
    const article = extractArticle(html, url);
    const sourceUrl = normalizeUrl(article.canonical_url || url);
    if (!sourceUrl || seenUrls.has(`${sourceUrl}:canonical`)) continue;
    seenUrls.add(`${sourceUrl}:canonical`);
    const combined = `${article.title || ""}\n${article.snippet || ""}\n${article.body || ""}`;
    if (!article.title || !isAccidentRelevant(combined)) continue;
    const incidentType = classify(combined);
    if (incidentType !== "vehicular") continue;
    const location = extractLocation(article.title, article.snippet, article.body);
    if (!incidentType || !isValidLocation(location)) continue;
    const geo = await geocode(location);
    const record = {
      title: article.title,
      snippet: article.snippet,
      body: article.body,
      source_url: sourceUrl,
      source_site: source.key,
      source_name: source.name,
      incident_type: incidentType,
      incident_type_key: incidentType,
      incident_type_label: incidentTypeLabel(incidentType),
      location,
      location_text: location.locationText,
      published_at: article.published_at || new Date().toISOString(),
      victim_count: extractVictimCount(combined),
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
  }
  return records;
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
  const seenUrls = new Set();
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
      records.push(...await processSource(source, safeMode, stats, seenUrls, { pageFrom, pageTo }));
    } catch (error) {
      stats.failed_urls.push(`${source.key}: ${error.message}`);
    }
  }
  updateScraperProgress({ phase: "saving", page_url: null, article: 0, articles_total: records.length });
  return { mode: safeMode, source_key: sourceKey, page_from: pageFrom, page_to: pageTo, records, stats };
}

// Compatibility export for callers from the original one-source scraper.
export async function scrapeBombo(options = {}) {
  return (await scrapeSources(options)).records;
}
