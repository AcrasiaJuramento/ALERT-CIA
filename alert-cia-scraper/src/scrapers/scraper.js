import { ENABLED_SOURCES } from "../constants/sources";
import { classify, incidentTypeLabel } from "../lib/classify";
import { extractVictimCount, incidentKey } from "../lib/deduplication";
import { extractArticle } from "../lib/extractArticle";
import { extractLinks, extractNextPage } from "../lib/extractLinks";
import { fetchHTML, fetchHTMLBatch } from "../lib/fetchHTML";
import { isRelevant } from "../lib/filters";
import { geocode } from "../lib/geocode";
import { extractLocation, isValidLocation } from "../lib/locations";
import { findExistingSourceUrls } from "../lib/scraperStore";
import { normalizeUrl } from "../lib/urls";

const UPDATE_DUPLICATE_THRESHOLD = 0.8;

async function listPages(source, mode, stats) {
  const maxPages = mode === "full" ? source.maxPagesFull : source.maxPagesUpdate;
  const links = new Set();
  let nextUrl = source.firstPageUrl;
  let duplicateHeavyPages = 0;

  for (let page = 1; page <= maxPages && nextUrl; page += 1) {
    const pageUrl = source.paginationType === "next_link" ? nextUrl : source.pageUrl(page);
    const html = await fetchHTML(pageUrl, { cacheTtlMs: mode === "full" ? 30 * 60 * 1000 : 3 * 60 * 1000 });
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

    nextUrl = extractNextPage(html, pageUrl);
    if (source.paginationType === "next_link" && !nextUrl) break;
    if (source.paginationType !== "next_link" && page >= maxPages) break;
  }
  return [...links];
}

async function processSource(source, mode, stats, seenUrls) {
  const listLinks = await listPages(source, mode, stats);
  const normalizedLinks = listLinks.map((url) => normalizeUrl(url)).filter(Boolean)
    .filter((url) => !seenUrls.has(url));
  normalizedLinks.forEach((url) => seenUrls.add(url));

  const existing = await findExistingSourceUrls(normalizedLinks);
  stats.duplicates_skipped += existing.size;
  const pending = normalizedLinks.filter((url) => !existing.has(url));
  const pages = await fetchHTMLBatch(pending, { concurrency: 5, cacheTtlMs: 15 * 60 * 1000 });
  const records = [];

  for (const url of pending) {
    const html = pages.get(url);
    stats.articles_checked += 1;
    if (!html) { stats.failed_urls.push(url); continue; }
    const article = extractArticle(html, url);
    const sourceUrl = normalizeUrl(article.canonical_url || url);
    if (!sourceUrl || seenUrls.has(`${sourceUrl}:canonical`)) continue;
    seenUrls.add(`${sourceUrl}:canonical`);
    const combined = `${article.title || ""}\n${article.snippet || ""}\n${article.body || ""}`;
    if (!article.title || !isRelevant(combined)) continue;
    const incidentType = classify(combined);
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
      geocode_confidence: geo.geocode_confidence,
    };
    record.incident_key = incidentKey(record);
    records.push(record);
  }
  return records;
}

export async function scrapeSources({ mode = "update" } = {}) {
  const safeMode = mode === "full" ? "full" : "update";
  const stats = {
    sources_checked: 0,
    pages_checked: 0,
    articles_checked: 0,
    duplicates_skipped: 0,
    failed_urls: [],
  };
  const records = [];
  const seenUrls = new Set();

  for (const source of ENABLED_SOURCES) {
    stats.sources_checked += 1;
    try {
      records.push(...await processSource(source, safeMode, stats, seenUrls));
    } catch (error) {
      stats.failed_urls.push(`${source.key}: ${error.message}`);
    }
  }
  return { mode: safeMode, records, stats };
}

// Compatibility export for callers from the original one-source scraper.
export async function scrapeBombo(options = {}) {
  return (await scrapeSources(options)).records;
}
