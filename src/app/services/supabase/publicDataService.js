import { runSupabaseRequest } from './errors';
import { createReadThroughCache } from '../../utils/readThroughCache.js';
import { accidentProneWindowStart } from '../../utils/accidentProneWindow.js';
import { onDataInvalidated } from '../../utils/dataInvalidation.js';

const cache = createReadThroughCache();
const STORAGE_PREFIX = 'alert-cia:public-projection:v1:';
const INVALIDATION_KEY = 'alert-cia:public-projection-invalidated';
let generation = 0;
export const PUBLIC_TTL = 10 * 60_000;
export const ANALYSIS_TTL = 30 * 60_000;
export function invalidatePublicData() {
  generation += 1;
  cache.invalidate();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
    localStorage.setItem(INVALIDATION_KEY, `${Date.now()}:${Math.random()}`);
  } catch { /* Storage is optional, including in offline/private browser mode. */ }
}
onDataInvalidated(invalidatePublicData);
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === INVALIDATION_KEY) { generation += 1; cache.invalidate(); }
});
export const readPublicData = (key, loader, ttl = PUBLIC_TTL) => cache.read(key, async () => {
  const storageKey = STORAGE_PREFIX + key;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Date.now() - saved.savedAt < ttl) return saved.value;
  } catch { /* Continue with the network when storage is unavailable. */ }
  const started = generation;
  const value = await loader();
  if (started === generation) try {
    // Retain at most 40 public query results; never persist internal staff analytics.
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    while (keys.length >= 40) localStorage.removeItem(keys.shift());
    localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), value }));
  } catch { /* Quota does not prevent a successful live read. */ }
  return value;
}, ttl);

export function publicMapOptions({ limit = 200, from = 0, bounds = null, since = accidentProneWindowStart().toISOString().slice(0, 10), until = null } = {}) {
  return { limit: Math.min(500, Math.max(1, Math.floor(Number(limit) || 200))), from: Math.max(0, Math.floor(Number(from) || 0)), bounds, since, until };
}

export function queryPublicView(view, columns, options = {}, filters = {}) {
  const params = publicMapOptions(options);
  return readPublicData(`${view}:${JSON.stringify([params, filters])}`, () => runSupabaseRequest(client => {
    let query = client.from(view).select(columns).order('incident_date', { ascending: false }).order('id')
      .range(params.from, params.from + params.limit - 1);
    if (params.since) query = query.gte('incident_date', params.since);
    if (params.until) query = query.lte('incident_date', params.until);
    const b = params.bounds;
    if (b && ['south', 'north', 'west', 'east'].every(key => Number.isFinite(b[key]))) {
      query = query.gte('latitude', b.south).lte('latitude', b.north);
      query = b.west <= b.east ? query.gte('longitude', b.west).lte('longitude', b.east)
        : query.or(`longitude.gte.${b.west},longitude.lte.${b.east}`);
    }
    for (const [field, value] of Object.entries(filters)) if (value !== undefined) query = query.eq(field, value);
    return query;
  }, 'Unable to load public map data. Apply migration 94_public_data_layer.sql.'));
}
