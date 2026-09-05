// Shared reads with request coalescing. Invalidated in-flight reads cannot repopulate cache.
export function createReadThroughCache({ maxEntries = 100, now = Date.now } = {}) {
  const entries = new Map();
  const pending = new Map();
  let generation = 0;
  return {
    async read(key, loader, ttlMs) {
      const entry = entries.get(key);
      if (entry && entry.expires > now()) return structuredClone(entry.value);
      if (pending.has(key)) return structuredClone(await pending.get(key));
      const started = generation;
      const request = Promise.resolve().then(loader).then(value => {
        if (generation === started) {
          entries.delete(key);
          entries.set(key, { value, expires: now() + ttlMs });
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
        }
        return value;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return structuredClone(await request);
    },
    invalidate() { generation += 1; entries.clear(); pending.clear(); },
  };
}
