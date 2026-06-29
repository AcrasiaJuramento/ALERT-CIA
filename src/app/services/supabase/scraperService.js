import { runSupabaseRequest } from "./errors";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { resolveIsabelaBarangayGeometry } from "../../data/isabelaBarangayGeometry";

const scraperApiBaseUrl = String(import.meta.env.VITE_SCRAPER_API_URL || "")
  .trim()
  .replace(/\/+$/, "");

function getConfiguredScraperApiUrl() {
  if (!scraperApiBaseUrl) {
    throw new Error(
      "Scraper API is not configured. Set VITE_SCRAPER_API_URL for this deployment and redeploy the frontend.",
    );
  }

  return scraperApiBaseUrl;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return response.json().catch(() => ({}));
}

const ECHAGUE_BOUNDS = {
  north: 16.765,
  south: 16.625,
  west: 121.57,
  east: 121.74,
};

const SCRAPER_MAP_CACHE_TTL_MS = 30 * 60 * 1000;

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

function readBrowserCache(key) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!cached?.savedAt || Date.now() - cached.savedAt > SCRAPER_MAP_CACHE_TTL_MS) return null;
    return Array.isArray(cached.value) ? cached.value : null;
  } catch {
    return null;
  }
}

function writeBrowserCache(key, value) {
  if (typeof window === "undefined" || !window.localStorage) return value;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Storage can be unavailable in private mode; the live response is still usable.
  }
  return value;
}

function isAccidentMapRow(row = {}) {
  const values = [
    row.category,
    row.incident_type,
    row.incident_type_key,
    row.title,
    row.snippet,
    row.location_text,
  ].map(value => String(value || "").toLowerCase());

  return values.some(value => (
    value === "vehicular" ||
    value.includes("accident") ||
    value.includes("vehicular") ||
    value.includes("vehicle") ||
    value.includes("collision") ||
    value.includes("crash") ||
    value.includes("bangga") ||
    value.includes("aksidente")
  ));
}

function scraperRecordToApp(row = {}) {
  return {
    id: row.id,
    sourceId: row.source_id,
    runId: row.run_id,
    sourceSite: row.source_site,
    sourceUrl: row.source_url,
    title: row.title || "",
    snippet: row.snippet || "",
    incidentType: row.incident_type || "",
    category: row.category,
    severity: row.severity || "",
    location: row.location_text || "",
    displayName: row.display_name || "",
    lat: row.latitude,
    lon: row.longitude,
    barangayId: row.barangay_id,
    barangay: row.barangay?.name || "",
    relatedIncidentId: row.related_incident_id,
    status: row.status,
    scrapedAt: row.scraped_at,
    processedAt: row.processed_at,
    errorMessage: row.error_message || "",
    rawPayload: row.raw_payload || {},
    publicVisible: Boolean(row.public_visible),
    rawLocationText: row.raw_location_text || row.location_text || "",
    extractedBarangay: row.extracted_barangay || row.raw_payload?.location?.barangay || "",
    extractedMunicipality: row.extracted_municipality || row.raw_payload?.location?.municipality || "",
    extractedProvince: row.extracted_province || row.raw_payload?.location?.province || "",
    geocodePrecision: row.geocode_precision || row.raw_payload?.geocode_precision || "",
    matchConfidence: Number(row.match_confidence || 0),
    mappingStatus: row.mapping_status || "needs_review",
  };
}

function severityToMapSeverity(severity, incidentType) {
  const normalized = String(severity || "").toLowerCase();
  if (["black", "red", "critical"].includes(normalized)) return "critical";
  if (["yellow", "high", "warning"].includes(normalized)) return "warning";
  if (["green", "low"].includes(normalized)) return "moderate";
  if (["fire", "vehicular"].includes(incidentType)) return "warning";
  return "moderate";
}

function incidentTypeToMapType(record) {
  if (record.category === "vehicular" || record.incident_type === "vehicular") return "vehicular";
  if (["fire", "flood"].includes(record.incident_type)) return record.incident_type;
  if (["robbery", "theft"].includes(record.incident_type)) return "crime";
  if (["earthquake", "landslide"].includes(record.incident_type)) return "other";
  return record.incident_type || "other";
}

function latLngToPercentCoordinates(lat, lng) {
  const x = ((Number(lng) - ECHAGUE_BOUNDS.west) / (ECHAGUE_BOUNDS.east - ECHAGUE_BOUNDS.west)) * 100;
  const y = ((ECHAGUE_BOUNDS.north - Number(lat)) / (ECHAGUE_BOUNDS.north - ECHAGUE_BOUNDS.south)) * 100;

  return {
    x: Math.min(Math.max(x, 0), 100),
    y: Math.min(Math.max(y, 0), 100),
  };
}

function normalizedBarangayName(value = "") {
  return String(value).toLowerCase()
    .replace(/\bgeneral\b/g, "gen")
    .replace(/\bsanta\b/g, "sta")
    .replace(/\bsanto\b/g, "sto")
    .replace(/\b(?:barangay|brgy|bgy|baryo)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function geographyPoint(value) {
  if (value?.type === "Point" && Array.isArray(value.coordinates)) {
    return { lat: Number(value.coordinates[1]), lng: Number(value.coordinates[0]) };
  }
  if (typeof value === "string") {
    const match = value.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
    if (match) return { lat: Number(match[2]), lng: Number(match[1]) };
  }
  return null;
}

function scraperRecordToMapIncident(row = {}, boundaryPoint = null) {
  const type = incidentTypeToMapType(row);
  const extractedBarangay = row.extracted_barangay || row.raw_payload?.location?.barangay || "";
  const linkedBarangayMatches = extractedBarangay && row.barangay?.name &&
    normalizedBarangayName(extractedBarangay) === normalizedBarangayName(row.barangay.name);
  const centroid = linkedBarangayMatches ? geographyPoint(row.barangay?.centroid) : null;
  const precision = row.geocode_precision || row.raw_payload?.geocode_precision || "unknown";
  const geocodeIsSafe = !extractedBarangay || ["barangay", "road", "barangay_master"].includes(precision);
  const lat = boundaryPoint?.lat ?? centroid?.lat ?? (geocodeIsSafe ? Number(row.latitude) : Number.NaN);
  const lng = boundaryPoint?.lng ?? centroid?.lng ?? (geocodeIsSafe ? Number(row.longitude) : Number.NaN);
  const date = row.scraped_at ? new Date(row.scraped_at) : new Date();

  return {
    id: `SCR-${String(row.id).slice(0, 8)}`,
    recordId: row.id,
    sourceKind: row.related_incident_id || row.status === "promoted" || row.status === "imported"
      ? "promoted_scraped"
      : row.public_visible || row.status === "approved" || row.status === "matched"
        ? "reviewed_scraped"
        : "scraped",
    sourceLabel: row.source?.name || row.source_site || "External source",
    externalSourceUrl: row.source_url,
    type,
    severity: severityToMapSeverity(row.severity, type),
    location: row.location_text || row.display_name || row.barangay?.name || "Location from external source",
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    coordinates: latLngToPercentCoordinates(lat, lng),
    date: date.toISOString().slice(0, 10),
    time: date.toTimeString().slice(0, 5),
    status: row.related_incident_id ? "on_scene" : "in_route",
    assignedTeam: row.related_incident_id ? "Imported to ALERT-CIA" : "External monitoring",
    description: row.snippet || row.title || "External incident candidate from scraper.",
    title: row.title || "",
    reportedBy: row.source_site || "Scraper",
    publicVisible: Boolean(row.public_visible),
    scraperStatus: row.status,
    barangayBoundary: boundaryPoint?.feature || null,
    locationPrecision: boundaryPoint?.precision || (centroid ? "barangay_master" : precision),
    coordinateSource: boundaryPoint?.source || (centroid ? "Supabase barangay centroid" : row.raw_payload?.geocoded_from || "geocoder"),
    mappingStatus: boundaryPoint ? "matched_barangay" : row.mapping_status || "needs_review",
    matchConfidence: boundaryPoint ? 1 : Number(row.match_confidence || 0),
  };
}

async function scraperRowsToMapIncidents(rows = []) {
  return Promise.all(rows.map(async (row) => {
    const location = row.raw_payload?.location || {};
    const boundaryPoint = await resolveIsabelaBarangayGeometry({
      barangay: row.extracted_barangay || location.barangay || row.barangay?.name,
      municipality: row.extracted_municipality || location.municipality || row.barangay?.municipality,
    });
    return scraperRecordToMapIncident(row, boundaryPoint);
  }));
}

export async function listScraperSources() {
  return runSupabaseRequest(client =>
    client.from("scraper_sources").select("*").order("name", { ascending: true }),
  "Unable to load scraper sources.");
}

export async function triggerScraperRefresh({ type = "vehicular", mode = "update", sourceKey = null } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase authentication is required to refresh scraper data.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again before refreshing scraper data.");

  const apiBaseUrl = getConfiguredScraperApiUrl();

  let response;
  const params = new URLSearchParams({
    type,
    mode,
  });
  if (sourceKey) params.set("source", sourceKey);

  try {
    response = await fetch(`${apiBaseUrl}/api/run?${params.toString()}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new Error(
      `Scraper API at ${apiBaseUrl} could not be reached. Check the deployment URL, CORS allowlist, and service status.`,
    );
  }
  const payload = await readJsonResponse(response);

  if (!response.ok || payload.success === false) {
    throw new Error(
      payload.error ||
      `Scraper API returned ${response.status}. Verify VITE_SCRAPER_API_URL points to the scraper project, not the frontend.`,
    );
  }

  return payload;
}

export async function triggerFullScraperRefreshBySource({ type = "vehicular", onSourceStart } = {}) {
  const sources = await listScraperSources();
  const activeSources = asRows(sources).filter((source) => source.active !== false);
  const targets = activeSources.length ? activeSources : sources;
  const totals = {
    success: true,
    mode: "full",
    source_count: targets.length,
    sources_checked: 0,
    pages_checked: 0,
    articles_checked: 0,
    new_incidents: 0,
    merged_incidents: 0,
    duplicates_skipped: 0,
    failed_requests: 0,
    failed_sources: [],
    data: [],
  };

  for (const [index, source] of targets.entries()) {
    const sourceKey = source.source_key || source.key;
    onSourceStart?.({ source, index: index + 1, total: targets.length });
    try {
      const result = await triggerScraperRefresh({ type, mode: "full", sourceKey });
      totals.sources_checked += result.sources_checked || 0;
      totals.pages_checked += result.pages_checked || 0;
      totals.articles_checked += result.articles_checked || 0;
      totals.new_incidents += result.new_incidents || 0;
      totals.merged_incidents += result.merged_incidents || 0;
      totals.duplicates_skipped += result.duplicates_skipped || 0;
      totals.failed_requests += result.failed_requests || 0;
      if (Array.isArray(result.data)) totals.data.push(...result.data);
    } catch (error) {
      totals.success = false;
      totals.failed_sources.push({
        source_key: sourceKey,
        name: source.name || sourceKey,
        error: error.message || "Source scrape failed.",
      });
    }
  }

  return totals;
}

export async function getScraperProgress() {
  if (!scraperApiBaseUrl) return null;

  try {
    const response = await fetch(`${scraperApiBaseUrl}/api/status`, {
      headers: { Accept: "application/json" },
    });
    const payload = await readJsonResponse(response);
    return response.ok ? payload.progress || null : null;
  } catch {
    return null;
  }
}

export async function listScraperRuns({ limit = 50 } = {}) {
  return runSupabaseRequest(client =>
    client
      .from("scraper_runs")
      .select("*, source:scraper_sources(id, name, source_key)")
      .order("started_at", { ascending: false })
      .limit(limit),
  "Unable to load scraper runs.");
}

export async function listScraperRecords({ status, category, sourceId, limit = 100, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("scraper_records")
      .select("*, barangay:barangays(id, name), source:scraper_sources(id, name, source_key)")
      .is("deleted_at", null)
      .order("scraped_at", { ascending: false })
      .range(from, from + limit - 1);
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (sourceId) query = query.eq("source_id", sourceId);
    return query;
  }, "Unable to load scraper records.");

  return asRows(rows).map(scraperRecordToApp);
}

export async function listPublicScrapedMapIncidents({ limit = 100 } = {}) {
  if (!isSupabaseConfigured) return [];
  const cacheKey = `alert-cia:public-scraped-map:${limit}`;

  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("scraper_records")
        .select("*, barangay:barangays(id, name, municipality, province, centroid)")
        .eq("public_visible", true)
        .in("status", ["approved", "promoted", "matched", "imported"])
        .is("deleted_at", null)
        .order("scraped_at", { ascending: false })
        .limit(limit),
    "Unable to load public scraper map incidents.");
    const mapped = await scraperRowsToMapIncidents(asRows(rows).filter(isAccidentMapRow));
    return writeBrowserCache(cacheKey, mapped);
  } catch (error) {
    const cached = readBrowserCache(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

export async function listOfficerScrapedMapIncidents({ limit = 200 } = {}) {
  if (!isSupabaseConfigured) return [];
  const cacheKey = `alert-cia:officer-scraped-map:${limit}`;

  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("scraper_records")
        .select("*, barangay:barangays(id, name, municipality, province, centroid), source:scraper_sources(id, name, source_key)")
        .in("status", ["pending_review", "approved", "promoted", "new", "matched", "imported"])
        .is("deleted_at", null)
        .order("scraped_at", { ascending: false })
        .limit(limit),
    "Unable to load officer scraper map incidents.");
    const mapped = await scraperRowsToMapIncidents(asRows(rows).filter(isAccidentMapRow));
    return writeBrowserCache(cacheKey, mapped);
  } catch (error) {
    const cached = readBrowserCache(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

export async function updateScraperRecordStatus(recordId, status, errorMessage = null) {
  return runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .update({
        status,
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("*, barangay:barangays(id, name)")
      .single(),
  "Unable to update scraper record.").then(scraperRecordToApp);
}

export async function approveScraperRecordForPublicMap(recordId) {
  return runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .update({
        status: "approved",
        public_visible: true,
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("*, barangay:barangays(id, name)")
      .single(),
  "Unable to approve scraper record for public map.").then(scraperRecordToApp);
}

export async function hideScraperRecordFromPublicMap(recordId) {
  return runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .update({
        public_visible: false,
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("*, barangay:barangays(id, name)")
      .single(),
  "Unable to hide scraper record from public map.").then(scraperRecordToApp);
}

export async function promoteScraperRecordToIncident(recordId) {
  return runSupabaseRequest(client =>
    client.rpc("promote_scraper_record_to_incident", { target_record_id: recordId }),
  "Unable to promote scraper record to incident.");
}

export async function archiveScraperRecord(recordId) {
  return runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .update({ deleted_at: new Date().toISOString(), status: "ignored", processed_at: new Date().toISOString() })
      .eq("id", recordId)
      .select("*")
      .single(),
  "Unable to archive scraper record.");
}
