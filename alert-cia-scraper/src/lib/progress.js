const progressKey = "__alertCiaScraperProgress";

function initialProgress() {
  return {
    running: false,
    mode: null,
    phase: "idle",
    source_key: null,
    source_name: null,
    source_index: 0,
    sources_total: 0,
    page: 0,
    max_pages: 0,
    page_url: null,
    article: 0,
    articles_total: 0,
    started_at: null,
    updated_at: new Date().toISOString(),
    error: null,
  };
}

function state() {
  if (!globalThis[progressKey]) globalThis[progressKey] = initialProgress();
  return globalThis[progressKey];
}

export function startScraperProgress({ mode, sourcesTotal }) {
  globalThis[progressKey] = {
    ...initialProgress(),
    running: true,
    mode,
    phase: "starting",
    sources_total: sourcesTotal,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function updateScraperProgress(changes = {}) {
  globalThis[progressKey] = {
    ...state(),
    ...changes,
    updated_at: new Date().toISOString(),
  };
}

export function completeScraperProgress({ success = true, error = null } = {}) {
  updateScraperProgress({
    running: false,
    phase: success ? "completed" : "failed",
    error,
  });
}

export function getScraperProgress() {
  return { ...state() };
}
