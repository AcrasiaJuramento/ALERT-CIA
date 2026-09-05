// Informational screens only. Dispatch, PCR and urgent alerts use immediate listeners.
export function createInformationalRefresh(refresh, {
  invalidate = () => {}, delay = 30_000, document: doc = globalThis.document,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let stale = false;
  let timer;
  let running = false;
  let disposed = false;
  const visible = () => !doc || doc.visibilityState === 'visible';
  const flush = async () => {
    timer = undefined;
    if (disposed || running || !stale || !visible()) return;
    stale = false;
    running = true;
    try { await refresh(); } finally {
      running = false;
      if (stale && visible() && !disposed) schedule();
    }
  };
  const schedule = () => {
    if (timer === undefined && !running && visible()) timer = setTimer(() => { void flush(); }, delay);
  };
  const markStale = ({ invalidateCache = true } = {}) => {
    if (disposed) return;
    stale = true;
    if (invalidateCache) invalidate();
    schedule();
  };
  const onVisibility = () => {
    if (!visible()) { clearTimer(timer); timer = undefined; }
    else if (stale) { clearTimer(timer); void flush(); }
  };
  doc?.addEventListener('visibilitychange', onVisibility);
  return {
    markStale,
    dispose() {
      disposed = true;
      clearTimer(timer);
      doc?.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
