const geoCache = new Map();
let geocodeReadyAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function queriesFor(location) {
  if (!location?.municipality) return [];
  const queries = [];
  if (location.barangay) queries.push(`Barangay ${location.barangay}, ${location.municipality}, Isabela, Philippines`);
  if (location.road) queries.push(`${location.road}, ${location.municipality}, Isabela, Philippines`);
  queries.push(`${location.municipality}, Isabela, Philippines`);
  return [...new Set(queries)];
}

async function requestGeocode(query) {
  const key = query.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = geocodeReadyAt - Date.now();
  if (wait > 0) await sleep(wait);
  geocodeReadyAt = Date.now() + 1100;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=ph&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "ALERT-CIA/2.0 (Isabela incident monitoring)", Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const row = data.find((item) => /isabela/i.test(item.display_name || "")) || null;
    const result = row ? {
      lat: Number(row.lat),
      lon: Number(row.lon),
      display_name: row.display_name,
      geocoded_from: query,
      geocode_status: "success",
      geocode_confidence: locationConfidence(query, row.display_name),
    } : null;
    geoCache.set(key, result);
    return result;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

function locationConfidence(query, displayName) {
  const queryWords = new Set(query.toLowerCase().split(/\W+/).filter((word) => word.length > 2));
  const display = displayName.toLowerCase();
  const matched = [...queryWords].filter((word) => display.includes(word)).length;
  return Math.min(1, matched / Math.max(queryWords.size, 1));
}

export async function geocode(location) {
  for (const query of queriesFor(location)) {
    const result = await requestGeocode(query);
    if (result) return result;
  }
  return {
    lat: null,
    lon: null,
    display_name: null,
    geocoded_from: queriesFor(location)[0] || null,
    geocode_status: "failed",
    geocode_confidence: 0,
  };
}

export function clearGeocodeCache() {
  geoCache.clear();
}
