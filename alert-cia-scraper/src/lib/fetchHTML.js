const responseCache = new Map();
const domainReadyAt = new Map();
const metrics = { requests: 0, cacheHits: 0, failures: 0, retries: 0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDomain(url, delayMs) {
  const host = new URL(url).hostname;
  const now = Date.now();
  const readyAt = domainReadyAt.get(host) || now;
  if (readyAt > now) await sleep(readyAt - now);
  domainReadyAt.set(host, Math.max(Date.now(), readyAt) + delayMs);
}

export async function fetchHTML(url, options = {}) {
  const {
    timeoutMs = 15000,
    retries = 2,
    cacheTtlMs = 5 * 60 * 1000,
    domainDelayMs = 250,
  } = options;
  const cached = responseCache.get(url);
  if (cached && Date.now() - cached.at < cacheTtlMs) {
    metrics.cacheHits += 1;
    return cached.html;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await waitForDomain(url, domainDelayMs);
      metrics.requests += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ALERT-CIA/2.0; +incident-monitoring)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-PH,en;q=0.9,fil;q=0.8",
        },
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (!html.trim()) throw new Error("Empty response");
      responseCache.set(url, { at: Date.now(), html });
      return html;
    } catch {
      if (attempt < retries) {
        metrics.retries += 1;
        await sleep(400 * (2 ** attempt) + Math.floor(Math.random() * 150));
      }
    }
  }

  metrics.failures += 1;
  return null;
}

export async function fetchHTMLBatch(urls, { concurrency = 5, ...options } = {}) {
  const results = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      results.set(url, await fetchHTML(url, options));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

export function getFetchMetrics() {
  return { ...metrics };
}

export function resetFetchMetrics() {
  Object.keys(metrics).forEach((key) => { metrics[key] = 0; });
}
