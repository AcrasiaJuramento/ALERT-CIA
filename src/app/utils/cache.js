const cacheStore = new Map();

export const CACHE_TTL = {
  RECORDS: 30_000,
  ANALYTICS: 60_000,
  GEOJSON: 5 * 60_000,
};

const now = () => Date.now();

export function getCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt && entry.expiresAt < now()) {
    cacheStore.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCache(key, value, ttl = CACHE_TTL.RECORDS) {
  cacheStore.set(key, {
    value,
    expiresAt: ttl ? now() + ttl : 0,
  });
  return value;
}

export function getOrSetCache(key, loader, ttl = CACHE_TTL.RECORDS) {
  const cached = getCache(key);
  if (cached !== undefined) return cached;
  return setCache(key, loader(), ttl);
}

export function invalidateCache(keyOrPrefix) {
  if (!keyOrPrefix) {
    cacheStore.clear();
    return;
  }

  for (const key of cacheStore.keys()) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) {
      cacheStore.delete(key);
    }
  }
}

export function cachedJsonStorage(key, fallback = []) {
  return getOrSetCache(`storage:${key}`, () => {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  });
}

export function setCachedJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  setCache(`storage:${key}`, value);
  invalidateCache('analytics');
  return value;
}
