import { extractLinks, extractNextPage } from "./extractLinks.js";
import { fetchHTML } from "./fetchHTML.js";
import { isArticleUrl, normalizeUrl } from "./urls.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getPath(value, path) {
  if (!path) return value;
  return String(path).split(".").reduce((current, key) => current?.[key], value);
}

function limitReached(startedAt, limits, links) {
  return links.size >= limits.maxArticles || Date.now() - startedAt >= limits.maxRuntimeMs;
}

function addLinks(target, links, source) {
  const before = target.size;
  links.map((url) => normalizeUrl(url)).filter(Boolean).forEach((url) => {
    if (isArticleUrl(url, source)) target.add(url);
  });
  return target.size - before;
}

async function discoverPagination(source, mode, stats, sourceHealth, pageRange = {}) {
  const limits = source.discoveryLimits;
  const startedAt = Date.now();
  const configuredMaxPages = mode === "full" ? source.maxPagesFull : source.maxPagesUpdate;
  const maxPages = Math.min(configuredMaxPages, pageRange.pageTo || configuredMaxPages);
  const startPage = Math.max(1, Math.min(Number(pageRange.pageFrom) || 1, maxPages));
  const links = new Set();
  const visitedPages = new Set();
  const pages = [];
  const searchTerms = Array.isArray(source.searchTerms) && source.searchTerms.length
    ? source.searchTerms
    : [null];

  for (const searchTerm of searchTerms) {
    let nextUrl = searchTerm && source.searchUrl ? source.searchUrl(searchTerm, 1) : source.firstPageUrl;
    let detectedNextUrl = null;

    for (let page = startPage; page <= maxPages; page += 1) {
      if (limitReached(startedAt, limits, links)) break;
      const configuredPageUrl = searchTerm && source.searchUrl
        ? source.searchUrl(searchTerm, page)
        : source.pageUrl(page);
      const pageUrl = source.paginationType === "next_link" && page === 1
        ? nextUrl
        : detectedNextUrl || configuredPageUrl;
      if (!pageUrl || visitedPages.has(pageUrl)) break;
      visitedPages.add(pageUrl);
      const html = await fetchHTML(pageUrl, { cacheTtlMs: mode === "full" ? 60 * 60 * 1000 : 15 * 60 * 1000 });
      stats.pages_checked += 1;
      sourceHealth.pages_checked += 1;
      pages.push(pageUrl);
      if (!html) {
        stats.failed_urls.push(pageUrl);
        sourceHealth.failed_count += 1;
        sourceHealth.last_error = `Unable to download page ${pageUrl}`;
        if (page === 1) break;
        continue;
      }

      const newCount = addLinks(links, extractLinks(html, pageUrl, source), source);
      sourceHealth.links_found += newCount;
      if (!newCount) break;
      detectedNextUrl = extractNextPage(html, pageUrl);
      if (source.paginationType === "next_link") {
        nextUrl = detectedNextUrl;
        if (!nextUrl) break;
      }
      if (limits.delayMs) await sleep(limits.delayMs);
    }
    if (limitReached(startedAt, limits, links)) break;
  }
  return { links: [...links], pages };
}

async function discoverApi(source, mode, stats, sourceHealth) {
  const limits = source.discoveryLimits;
  const startedAt = Date.now();
  const links = new Set();
  const pages = [];
  let noNew = 0;

  for (let page = 1; page <= limits.maxScrolls; page += 1) {
    if (limitReached(startedAt, limits, links) || noNew >= limits.noNewArticleLimit) break;
    const apiUrl = typeof source.apiUrl === "function" ? source.apiUrl(page) : source.apiUrl;
    if (!apiUrl) break;
    const text = await fetchHTML(apiUrl, { cacheTtlMs: mode === "full" ? 60 * 60 * 1000 : 15 * 60 * 1000 });
    stats.pages_checked += 1;
    sourceHealth.pages_checked += 1;
    pages.push(apiUrl);
    if (!text) {
      sourceHealth.failed_count += 1;
      sourceHealth.last_error = `Unable to download API page ${apiUrl}`;
      break;
    }
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      sourceHealth.failed_count += 1;
      sourceHealth.last_error = `API response was not JSON: ${apiUrl}`;
      break;
    }
    const items = getPath(payload, source.apiItemsPath);
    const urls = Array.isArray(items)
      ? items.map((item) => getPath(item, source.apiUrlPath)).filter(Boolean)
      : [];
    const newCount = addLinks(links, urls, source);
    sourceHealth.links_found += newCount;
    noNew = newCount ? 0 : noNew + 1;
    if (limits.delayMs) await sleep(limits.delayMs);
  }
  return { links: [...links], pages };
}

async function discoverHttpScroll(source, mode, stats, sourceHealth) {
  const limits = source.discoveryLimits;
  const startedAt = Date.now();
  const links = new Set();
  const pages = [];
  let noNew = 0;

  for (let scroll = 1; scroll <= limits.maxScrolls; scroll += 1) {
    if (limitReached(startedAt, limits, links) || noNew >= limits.noNewArticleLimit) break;
    const pageUrl = source.pageUrl?.(scroll) || source.scrollUrl || source.firstPageUrl;
    const html = await fetchHTML(pageUrl, { cacheTtlMs: mode === "full" ? 60 * 60 * 1000 : 15 * 60 * 1000 });
    stats.pages_checked += 1;
    sourceHealth.pages_checked += 1;
    pages.push(pageUrl);
    if (!html) {
      sourceHealth.failed_count += 1;
      sourceHealth.last_error = `Unable to download scroll page ${pageUrl}`;
      break;
    }
    const newCount = addLinks(links, extractLinks(html, pageUrl, source), source);
    sourceHealth.links_found += newCount;
    noNew = newCount ? 0 : noNew + 1;
    if (limits.delayMs) await sleep(limits.delayMs);
  }
  return { links: [...links], pages };
}

async function discoverBrowserScroll(source, stats, sourceHealth) {
  let chromium;
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)");
    ({ chromium } = await dynamicImport("playwright"));
  } catch {
    sourceHealth.last_error = "Browser scrolling requested but Playwright is not installed.";
    return { links: [], pages: [], browserUnavailable: true };
  }

  const limits = source.discoveryLimits;
  const startedAt = Date.now();
  const links = new Set();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ javaScriptEnabled: true });
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "media", "font", "stylesheet"].includes(type)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await page.goto(source.scrollUrl || source.firstPageUrl, { waitUntil: "domcontentloaded", timeout: Math.min(limits.maxRuntimeMs, 30_000) });
    stats.pages_checked += 1;
    sourceHealth.pages_checked += 1;
    let noNew = 0;
    for (let index = 0; index < limits.maxScrolls; index += 1) {
      if (limitReached(startedAt, limits, links) || noNew >= limits.noNewArticleLimit) break;
      const urls = await page.$$eval("a[href]", (anchors) => anchors.map((anchor) => anchor.href));
      const newCount = addLinks(links, urls, source);
      sourceHealth.links_found += newCount;
      noNew = newCount ? 0 : noNew + 1;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(limits.delayMs || 500);
    }
  } finally {
    await browser.close();
  }
  return { links: [...links], pages: [source.scrollUrl || source.firstPageUrl] };
}

export async function discoverArticleLinks(source, mode, stats, sourceHealth, pageRange = {}) {
  if (source.loadingStrategy === "api" && source.apiUrl) {
    return discoverApi(source, mode, stats, sourceHealth);
  }
  if (source.loadingStrategy === "load_more" && source.loadMoreUrl) {
    return discoverApi({ ...source, apiUrl: source.loadMoreUrl }, mode, stats, sourceHealth);
  }
  if (source.loadingStrategy === "infinite_scroll") {
    const runtimeEnv = globalThis.process?.env || {};
    const browserAllowed = String(runtimeEnv.SCRAPER_ENABLE_BROWSER_SCROLL || "").toLowerCase() === "true";
    const httpResult = await discoverHttpScroll(source, mode, stats, sourceHealth);
    if (httpResult.links.length || !browserAllowed) return httpResult;
    return discoverBrowserScroll(source, stats, sourceHealth);
  }
  if (source.loadingStrategy === "static") {
    const html = await fetchHTML(source.firstPageUrl, { cacheTtlMs: mode === "full" ? 60 * 60 * 1000 : 15 * 60 * 1000 });
    stats.pages_checked += 1;
    sourceHealth.pages_checked += 1;
    if (!html) return { links: [], pages: [source.firstPageUrl] };
    const links = new Set();
    sourceHealth.links_found += addLinks(links, extractLinks(html, source.firstPageUrl, source), source);
    return { links: [...links], pages: [source.firstPageUrl] };
  }
  return discoverPagination(source, mode, stats, sourceHealth, pageRange);
}
