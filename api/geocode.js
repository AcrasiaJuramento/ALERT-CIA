const CACHE_TTL_MS = 10 * 60 * 1000;
const ISABELA_CENTER = [16.705, 121.676];
const LOCAL_BBOX = {
  south: 16.45,
  west: 121.45,
  north: 16.9,
  east: 121.95,
};

const cache = globalThis.__ALERT_CIA_GEOCODE_CACHE || new Map();
globalThis.__ALERT_CIA_GEOCODE_CACHE = cache;

function distanceKm(from, to) {
  if (!from || !to) return Infinity;
  const [lat1, lon1] = from.map(Number);
  const [lat2, lon2] = to.map(Number);
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jsonHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
  };
}

function clean(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function tokens(value = "") {
  return clean(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 2);
}

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value = "") {
  return clean(value)
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function makeLabelFromNominatim(item = {}, fallback = "") {
  const displayName = item.display_name || fallback;
  const primary = item.name || item.namedetails?.name || displayName.split(",")[0] || fallback;
  const addressParts = displayName
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
  const context = addressParts
    .filter(part => part.toLowerCase() !== primary.toLowerCase())
    .slice(0, 4)
    .join(", ");
  return context ? `${primary}, ${context}` : primary;
}

function normalizeNominatim(item = {}, fallback = "") {
  const latLng = [Number(item.lat), Number(item.lon)];
  return {
    id: item.place_id || `${item.osm_type || "place"}-${item.osm_id || item.display_name}`,
    label: makeLabelFromNominatim(item, fallback),
    latLng,
    type: item.type || item.class || "Place",
    source: "OpenStreetMap",
    distance: distanceKm(ISABELA_CENTER, latLng),
  };
}

function normalizeOverpassElement(element = {}) {
  const tags = element.tags || {};
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  const barangay = tags["addr:barangay"] || tags["addr:suburb"] || tags["addr:village"] || tags["addr:city"] || "";
  const city = tags["addr:city"] || tags["addr:municipality"] || "Isabela";
  const label = [tags.name || tags.brand || "Mapped place", barangay, city, "Philippines"].filter(Boolean).join(", ");
  const type = tags.amenity === "fuel" ? "Fuel station" : tags.amenity || tags.shop || tags.tourism || tags.office || "Place";

  return {
    id: `${element.type}-${element.id}`,
    label,
    latLng: [lat, lon],
    type: titleCase(type),
    source: "OpenStreetMap POI",
    distance: distanceKm(ISABELA_CENTER, [lat, lon]),
    searchText: Object.entries(tags).map(([key, value]) => `${key} ${value}`).join(" "),
  };
}

function normalizePhotonFeature(feature = {}) {
  const props = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [];
  const context = [
    props.street,
    props.locality || props.district,
    props.city,
    props.state,
    props.country,
  ].filter(Boolean);
  const label = [props.name || props.street || "Mapped place", ...context]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(", ");
  const type = props.osm_value || props.osm_key || props.type || "Place";

  return {
    id: `photon-${props.osm_type || "osm"}-${props.osm_id || label}`,
    label,
    latLng: [Number(lat), Number(lon)],
    type: titleCase(type),
    source: "OpenStreetMap Search",
    distance: distanceKm(ISABELA_CENTER, [Number(lat), Number(lon)]),
    searchText: Object.values(props).join(" "),
  };
}

function scoreResult(result, queryTokens) {
  const haystack = `${result.label || ""} ${result.type || ""} ${result.searchText || ""}`.toLowerCase();
  const matched = queryTokens.filter(token => haystack.includes(token));
  const phraseBonus = haystack.includes(queryTokens.join(" ")) ? 3 : 0;
  const fuelBonus = queryTokens.some(token => ["gas", "gasoline", "fuel"].includes(token)) && /fuel|gas/i.test(haystack) ? 2 : 0;
  return matched.length * 4 + phraseBonus + fuelBonus - Math.min(result.distance || 0, 75) / 20;
}

function buildNominatimQuery(query) {
  const lower = query.toLowerCase();
  if (/(philippines|isabela|santiago|echague)/i.test(lower)) return query;
  return `${query}, Isabela, Philippines`;
}

async function fetchNominatim(query, limit) {
  const searchParams = new URLSearchParams({
    format: "jsonv2",
    limit: String(limit),
    countrycodes: "ph",
    addressdetails: "1",
    namedetails: "1",
    extratags: "1",
    q: buildNominatimQuery(query),
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${searchParams.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ALERT-CIA public safety map geocoder",
    },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload) ? payload.map(item => normalizeNominatim(item, query)) : [];
}

async function fetchPhoton(query, limit) {
  const searchParams = new URLSearchParams({
    q: query,
    limit: String(Math.max(limit * 2, 10)),
    lat: String(ISABELA_CENTER[0]),
    lon: String(ISABELA_CENTER[1]),
  });
  const response = await fetch(`https://photon.komoot.io/api/?${searchParams.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ALERT-CIA public safety map geocoder",
    },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.features) ? payload.features.map(normalizePhotonFeature) : [];
}

async function fetchOverpass(query, limit) {
  const queryTokens = tokens(query);
  const usefulTokens = queryTokens.filter(token => !["station", "store", "road", "street", "libertad"].includes(token));
  const regexToken = usefulTokens.find(token => /\d/.test(token)) || usefulTokens[0] || queryTokens[0];
  if (!regexToken) return [];

  const nameRegex = escapeRegex(regexToken);
  const bbox = `${LOCAL_BBOX.south},${LOCAL_BBOX.west},${LOCAL_BBOX.north},${LOCAL_BBOX.east}`;
  const fuelFilter = queryTokens.some(token => ["gas", "gasoline", "fuel"].includes(token))
    ? `node["amenity"="fuel"](${bbox});way["amenity"="fuel"](${bbox});relation["amenity"="fuel"](${bbox});`
    : "";
  const overpassQuery = `
    [out:json][timeout:15];
    (
      node["name"~"${nameRegex}",i](${bbox});
      way["name"~"${nameRegex}",i](${bbox});
      relation["name"~"${nameRegex}",i](${bbox});
      ${fuelFilter}
    );
    out center tags ${Math.max(limit * 4, 20)};
  `;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "ALERT-CIA public safety map geocoder",
    },
    body: new URLSearchParams({ data: overpassQuery }),
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.elements) ? payload.elements.map(normalizeOverpassElement) : [];
}

export async function geocodeSearch(rawQuery = "", rawLimit = 6) {
  const query = clean(rawQuery);
  const limit = Math.min(Math.max(Number(rawLimit) || 6, 1), 10);
  if (query.length < 2) return [];

  const cacheKey = `${query.toLowerCase()}::${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.results;

  const queryTokens = tokens(query);
  const nominatimResults = await fetchNominatim(query, limit);
  const needsPoiFallback = nominatimResults.length < limit || queryTokens.some(token => ["gas", "gasoline", "fuel", "store", "school", "institute"].includes(token));
  const photonResults = needsPoiFallback ? await fetchPhoton(query, limit) : [];
  const overpassResults = needsPoiFallback && photonResults.length < limit ? await fetchOverpass(query, limit) : [];

  const results = [...nominatimResults, ...photonResults, ...overpassResults]
    .filter(item => item.latLng?.every(Number.isFinite))
    .filter(item => item.distance <= 85)
    .map(item => ({ ...item, score: scoreResult(item, queryTokens) }))
    .filter(item => item.score > -2 || item.source === "OpenStreetMap")
    .sort((first, second) => second.score - first.score || first.distance - second.distance);

  const deduped = [...new Map(results.map(item => [item.id || item.label.toLowerCase(), item])).values()]
    .slice(0, limit)
    .map(item => {
      const cleaned = { ...item };
      delete cleaned.searchText;
      delete cleaned.score;
      return cleaned;
    });

  cache.set(cacheKey, { timestamp: Date.now(), results: deduped });
  return deduped;
}

export default async function handler(req, res) {
  const headers = jsonHeaders();
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "Method not allowed." });
    return;
  }

  try {
    const requestUrl = new URL(req.url || "/api/geocode", `https://${req.headers.host || "localhost"}`);
    const results = await geocodeSearch(requestUrl.searchParams.get("q") || "", requestUrl.searchParams.get("limit") || 6);
    res.status(200).json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Place search is unavailable.", results: [] });
  }
}
