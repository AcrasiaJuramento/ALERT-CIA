import {
  listScraperSources,
  triggerFullScraperRefreshBySource,
  triggerScraperRefresh,
} from './supabase';

const DEFAULT_SCRAPER_SOURCE_COUNT = 15;

const listeners = new Set();
let controller = null;

const initialState = {
  running: false,
  mode: null,
  progress: null,
  message: '',
  error: '',
};

let state = { ...initialState };

function emit() {
  listeners.forEach(listener => listener({ ...state }));
}

function setState(changes) {
  state = { ...state, ...changes };
  emit();
}

function buildLocalProgress(mode, sourcesTotal = DEFAULT_SCRAPER_SOURCE_COUNT) {
  return {
    running: true,
    mode,
    phase: 'starting',
    source_name: mode === 'full' ? 'Full scrape queued' : 'Update scrape queued',
    source_index: 0,
    sources_total: sourcesTotal,
    page: null,
    page_to: null,
    max_pages: mode === 'full' ? 'all' : 3,
    article: 0,
    articles_total: 0,
  };
}

function resultMessage(mode, result = {}) {
  const inserted = result.new_incidents ?? result.totals?.inserted ?? 0;
  const merged = result.merged_incidents ?? result.totals?.matched ?? 0;
  const duplicates = result.duplicates_skipped ?? result.totals?.duplicates ?? 0;
  const failedSources = result.failed_sources?.length || 0;
  return `${mode === 'full' ? 'Full accident scrape' : 'Accident update'} completed: ${inserted} new, ${merged} merged, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped${failedSources ? `, ${failedSources} source${failedSources === 1 ? '' : 's'} failed` : ''}.`;
}

export function subscribeScraperJob(listener) {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function getScraperJobState() {
  return { ...state };
}

export function cancelScraperJob() {
  if (!state.running) return;
  controller?.abort();
  setState({
    running: false,
    mode: null,
    error: 'Scrape cancelled.',
    progress: state.progress ? { ...state.progress, running: false, phase: 'cancelled' } : null,
  });
}

export async function startScraperJob(mode = 'update') {
  if (state.running) return getScraperJobState();

  controller = new AbortController();
  setState({
    running: true,
    mode,
    message: '',
    error: '',
    progress: buildLocalProgress(mode),
  });

  try {
    listScraperSources()
      .then((sources = []) => {
        if (controller?.signal.aborted) return;
        const activeSources = sources.filter(source => source.active !== false);
        const sourceTotal = activeSources.length || sources.length || DEFAULT_SCRAPER_SOURCE_COUNT;
        setState({
          progress: {
            ...(state.progress || buildLocalProgress(mode, sourceTotal)),
            sources_total: sourceTotal,
            source_name: mode === 'full' ? 'Full scrape running' : 'Update scrape running',
          },
        });
      })
      .catch(() => {});

    const result = mode === 'full'
      ? await triggerFullScraperRefreshBySource({
          type: 'vehicular',
          signal: controller.signal,
          onSourceStart: ({ source, index, total, pageFrom, pageTo, maxPages }) => {
            setState({
              progress: {
                ...(state.progress || buildLocalProgress(mode, total)),
                source_name: source.name || source.source_key || 'News source',
                source_index: index,
                sources_total: total,
                phase: 'source_running',
                page: pageFrom,
                page_to: pageTo,
                max_pages: maxPages || source.metadata?.max_pages_full || 'all',
              },
            });
          },
        })
      : await triggerScraperRefresh({ type: 'vehicular', mode, signal: controller.signal });

    if (controller.signal.aborted) return getScraperJobState();

    setState({
      running: false,
      mode: null,
      message: resultMessage(mode, result),
      progress: state.progress ? { ...state.progress, running: false, phase: 'completed' } : null,
    });
    return result;
  } catch (error) {
    const cancelled = error.name === 'AbortError' || controller?.signal.aborted;
    setState({
      running: false,
      mode: null,
      error: cancelled ? 'Scrape cancelled.' : (error.message || 'Unable to refresh scraper data.'),
      progress: state.progress ? { ...state.progress, running: false, phase: cancelled ? 'cancelled' : 'failed' } : null,
    });
    if (!cancelled) throw error;
    return getScraperJobState();
  } finally {
    controller = null;
  }
}
