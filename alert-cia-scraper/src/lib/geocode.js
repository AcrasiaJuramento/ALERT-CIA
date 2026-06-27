const geoCache = new Map();
let geocodeReadyAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function expandBarangayName(name = "") {
  return name
    .replace(/\bGen\.?\s+/i, "General ")
    .replace(/\bSta\.?\s+/i, "Santa ")
    .replace(/\bSto\.?\s+/i, "Santo ")
    .replace(/\bSn\.?\s+/i, "San ")
    .trim();
}

function normalizedPlaceName(value = "") {
  return expandBarangayName(value)
    .toLowerCase()
    .replace(/\b(?:barangay|brgy|bgy|baryo)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function queriesFor(location) {
  if (!location?.municipality) return [];
  const municipality = location.municipalityType === "city" ? `${location.municipality} City` : location.municipality;
  const queries = [];
  if (location.barangay) {
    const names = [...new Set([location.barangay, expandBarangayName(location.barangay)])];
    for (const name of names) {
      queries.push({ query: `Barangay ${name}, ${municipality}, Isabela, Philippines`, precision: "barangay" });
      queries.push({ query: `${name}, ${municipality}, Isabela, Philippines`, precision: "barangay" });
    }
  }
  if (location.road) queries.push({ query: `${location.road}, ${municipality}, Isabela, Philippines`, precision: "road" });
  queries.push({ query: `${municipality}, Isabela, Philippines`, precision: "municipality" });
  return queries.filter((item, index, all) => all.findIndex((other) => other.query === item.query) === index);
}

async function requestGeocode({ query, precision }, location) {
  const key = query.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = geocodeReadyAt - Date.now();
  if (wait > 0) await sleep(wait);
  geocodeReadyAt = Date.now() + 1100;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ph&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "ALERT-CIA/2.0 (Isabela incident monitoring)", Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const municipalityPattern = new RegExp(location.municipality.replace(/\s+/g, "\\s+"), "i");
    const expectedBarangay = normalizedPlaceName(location.barangay);
    const row = data.find((item) => {
      const displayName = item.display_name || "";
      if (!/isabela/i.test(displayName) || !municipalityPattern.test(displayName)) return false;
      if (precision === "barangay" && expectedBarangay) {
        return normalizedPlaceName(displayName).includes(expectedBarangay);
      }
      return true;
    }) || null;
    const result = row ? {
      lat: Number(row.lat),
      lon: Number(row.lon),
      display_name: row.display_name,
      geocoded_from: query,
      geocode_status: "success",
      geocode_precision: precision,
      geocode_confidence: locationConfidence(query, row.display_name, precision),
    } : null;
    geoCache.set(key, result);
    return result;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

function locationConfidence(query, displayName, precision) {
  const queryWords = new Set(query.toLowerCase().split(/\W+/).filter((word) => word.length > 2));
  const display = displayName.toLowerCase();
  const matched = [...queryWords].filter((word) => display.includes(word)).length;
  const precisionCap = precision === "barangay" ? 1 : precision === "road" ? 0.85 : 0.65;
  return Math.min(precisionCap, matched / Math.max(queryWords.size, 1));
}

export async function geocode(location) {
  const candidates = queriesFor(location);
  let municipalityFallback = null;
  for (const candidate of candidates) {
    const result = await requestGeocode(candidate, location);
    if (!result) continue;
    if (location.barangay && candidate.precision === "municipality") {
      municipalityFallback = result;
      continue;
    }
    return result;
  }
  if (municipalityFallback) {
    return {
      ...municipalityFallback,
      lat: null,
      lon: null,
      geocode_status: "failed",
      geocode_precision: "municipality",
      geocode_confidence: 0,
    };
  }
  return {
    lat: null,
    lon: null,
    display_name: null,
    geocoded_from: candidates[0]?.query || null,
    geocode_status: "failed",
    geocode_precision: null,
    geocode_confidence: 0,
  };
}

export function clearGeocodeCache() {
  geoCache.clear();
}
