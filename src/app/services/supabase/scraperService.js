import { runSupabaseRequest } from "./errors";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { resolveIsabelaBarangayGeometry } from "../../data/isabelaBarangayGeometry";
import { locationAssessment } from "../../utils/locationAccuracy";

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

const ACTIVE_SCRAPER_SOURCE_SITE = "bombo";
const ACTIVE_SCRAPER_SOURCE_URL_PATTERN = "%cauayan.bomboradyo.com%";
const SCRAPER_MAP_CACHE_TTL_MS = 30 * 60 * 1000;
const FULL_SCRAPE_PAGE_CHUNK_SIZE = 5;

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

function estimateLegacyScraperConfidence(row = {}) {
  const text = [
    row.incident_type,
    row.category,
    row.title,
    row.snippet,
    row.location_text,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const accidentTerms = ["accident", "aksidente", "bangga", "collision", "crash", "salpok", "nasagasaan", "vehicular"];
  const vehicleTerms = ["motorcycle", "motorsiklo", "tricycle", "truck", "bus", "car", "vehicle", "sasakyan", "pedestrian"];
  const nonAccidentTerms = ["carnapping", "stolen", "robbery", "theft", "holdap", "traffic law", "batas trapiko", "reminder", "paalala"];
  const hasAccident = accidentTerms.some(term => text.includes(term));
  const hasVehicle = vehicleTerms.some(term => text.includes(term));
  const hasNonAccident = nonAccidentTerms.some(term => text.includes(term));

  if (hasAccident && hasVehicle) {
    return {
      confidence: "medium",
      score: 0.55,
      reason: "Estimated from legacy scraped text: accident and vehicle terms found.",
    };
  }
  if (row.category === "vehicular" || row.incident_type === "vehicular") {
    return {
      confidence: "medium",
      score: 0.45,
      reason: "Estimated from legacy scraper category because no saved classifier metadata exists.",
    };
  }
  return {
    confidence: "low",
    score: hasNonAccident ? 0.15 : 0.2,
    reason: hasNonAccident
      ? "Estimated from legacy scraped text: non-accident traffic/crime context found."
      : "Legacy scraped record was created before confidence scoring and needs review.",
  };
}

function scraperRecordToApp(row = {}) {
  const fallbackConfidence = estimateLegacyScraperConfidence(row);
  const classificationConfidence = row.classification_confidence ||
    row.raw_payload?.classification_confidence ||
    row.raw_payload?.classification?.confidence ||
    fallbackConfidence.confidence;
  const classificationScore = Number(row.classification_score ||
    row.raw_payload?.classification_score ||
    row.raw_payload?.classification?.score ||
    fallbackConfidence.score);
  const classificationReason = row.classification_reason ||
    row.raw_payload?.classification_reason ||
    row.raw_payload?.classification?.reason ||
    fallbackConfidence.reason;

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
    needsManualReview: row.needs_manual_review ?? true,
    verifiedBy: row.verified_by || null,
    verifiedAt: row.verified_at || null,
    rejectedReason: row.rejected_reason || "",
    verifiedMunicipality: row.verified_municipality || "",
    verifiedBarangay: row.verified_barangay || "",
    verifiedPurokSitio: row.verified_purok_sitio || "",
    verifiedRoadPlace: row.verified_road_place || "",
    publishedAt: row.published_at || null,
    scrapedAt: row.scraped_at,
    processedAt: row.processed_at,
    errorMessage: row.error_message || "",
    rawPayload: row.raw_payload || {},
    publicVisible: Boolean(row.public_visible),
    rawLocationText: row.raw_location_text || row.location_text || "",
    extractedBarangay: row.extracted_barangay || row.raw_payload?.location?.barangay || "",
    extractedMunicipality: row.extracted_municipality || row.raw_payload?.location?.municipality || "",
    extractedProvince: row.extracted_province || row.raw_payload?.location?.province || "",
    extractedPurokSitio: row.purok_sitio || row.raw_payload?.location?.purokSitio || "",
    geocodePrecision: row.geocode_precision || row.raw_payload?.geocode_precision || "",
    matchConfidence: Number(row.match_confidence || 0),
    mappingStatus: row.mapping_status || "needs_review",
    classificationConfidence,
    classificationScore,
    classificationReason,
    articleContentHash: row.article_content_hash || row.raw_payload?.article_content_hash || "",
    locationConfidence: row.location_confidence || row.raw_payload?.location_confidence || row.raw_payload?.location?.confidence || {},
    originalLocationSnapshot: row.original_location_snapshot || null,
    locationCorrectedBy: row.location_corrected_by || null,
    locationCorrectedAt: row.location_corrected_at || null,
    incidentAt: row.raw_payload?.incident_at || null,
    incidentTimeSource: row.raw_payload?.incident_time_source || "",
    incidentTimeEvidence: row.raw_payload?.incident_time_evidence || "",
  };
}

function scraperCandidateToApp(row = {}) {
  return {
    id: row.id,
    runId: row.run_id,
    sourceId: row.source_id,
    sourceSite: row.source_site,
    sourceUrl: row.source_url,
    title: row.title || "Untitled article",
    snippet: row.snippet || "",
    publishedAt: row.published_at,
    detectedIncidentType: row.detected_incident_type || "",
    classificationConfidence: row.classification_confidence || "",
    classificationScore: Number(row.classification_score || 0),
    classificationReason: row.classification_reason || "",
    matchedTerms: row.matched_terms || [],
    rejectionReason: row.rejection_reason,
    rejectionDetails: row.rejection_details || "",
    rawLocationText: row.raw_location_text || "",
    extractedProvince: row.extracted_province || "",
    extractedMunicipality: row.extracted_municipality || "",
    extractedBarangay: row.extracted_barangay || "",
    extractedPurokSitio: row.extracted_purok_sitio || "",
    extractedRoad: row.extracted_road || "",
    locationConfidence: row.location_confidence || {},
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at,
  };
}

function scraperSourceHealthToApp(row = {}) {
  return {
    sourceId: row.source_id,
    sourceKey: row.source_key,
    sourceName: row.source_name,
    status: row.status || "unknown",
    lastScrapedAt: row.last_scraped_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    pagesChecked: Number(row.pages_checked || 0),
    linksFound: Number(row.links_found || 0),
    articlesProcessed: Number(row.articles_processed || 0),
    incidentsDetected: Number(row.incidents_detected || 0),
    rejectedCount: Number(row.rejected_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    failedCount: Number(row.failed_count || 0),
    cacheHits: Number(row.cache_hits || 0),
    retries: Number(row.retries || 0),
    lastError: row.last_error || "",
    metadata: row.metadata || {},
    updatedAt: row.updated_at,
  };
}

function validTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function scraperEventDate(row = {}) {
  return validTimestamp(
    row.raw_payload?.incident_at ||
    row.raw_payload?.incident_time?.incident_at ||
    row.raw_payload?.published_at ||
    row.raw_payload?.article?.published_at ||
    row.scraped_at,
  ) || new Date();
}

function formatManilaDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatManilaTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function scraperEventDateSource(row = {}) {
  if (row.raw_payload?.incident_at) return row.raw_payload?.incident_time_source || "article_text";
  if (row.raw_payload?.published_at || row.raw_payload?.article?.published_at) return "article_published_at";
  return "scraped_at";
}

function scraperRecordToAnalyticsIncident(row = {}) {
  const confidence = row.location_confidence || row.raw_payload?.location_confidence || {};
  const eventDate = scraperEventDate(row);
  return {
    id: `SCR-${String(row.id).slice(0, 8)}`,
    sourceKind: "verified_scraped",
    sourceLabel: row.source?.name || row.source_site || "External source",
    externalSourceUrl: row.source_url,
    classification: row.category === "vehicular" || row.incident_type === "vehicular" ? "mvc" : row.incident_type || "other",
    type: row.category === "vehicular" || row.incident_type === "vehicular" ? "vehicular" : row.incident_type || "other",
    priority: "medium",
    title: row.title || "",
    description: row.snippet || "",
    barangay: row.verified_barangay || row.extracted_barangay || row.barangay?.name || row.raw_payload?.location?.barangay || "Unspecified",
    municipality: row.verified_municipality || row.extracted_municipality || row.raw_payload?.location?.municipality || "Isabela",
    location: row.location_text || row.display_name || "",
    lat: row.latitude,
    lng: row.longitude,
    latitude: row.latitude,
    longitude: row.longitude,
    date: formatManilaDate(eventDate),
    time: formatManilaTime(eventDate),
    status: row.status,
    publicVisible: row.public_visible,
    scraperStatus: row.status,
    classificationConfidence: row.classification_confidence || "",
    classificationScore: Number(row.classification_score || 0),
    matchConfidence: Number(row.match_confidence || 0),
    locationConfidence: confidence,
    locationPrecision: row.geocode_precision || row.raw_payload?.geocode_precision || "",
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
    .replace(/\b(?:1|i|one|uno)\b/g, "1")
    .replace(/\b(?:2|ii|two|dos)\b/g, "2")
    .replace(/\b(?:3|iii|three|tres)\b/g, "3")
    .replace(/\b(?:4|iv|four|kwatro|cuatro)\b/g, "4")
    .replace(/\b(?:5|v|five|singko|cinco)\b/g, "5")
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

function hasFiniteCoordinates(row = {}) {
  return Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude));
}

function scraperRecordToMapIncident(row = {}, boundaryPoint = null) {
  const type = incidentTypeToMapType(row);
  const mappedBarangay = row.verified_barangay || row.extracted_barangay || row.raw_payload?.location?.barangay || row.barangay?.name || "";
  const mappedMunicipality = row.verified_municipality || row.extracted_municipality || row.raw_payload?.location?.municipality || row.barangay?.municipality || "";
  const linkedBarangayMatches = mappedBarangay && row.barangay?.name &&
    normalizedBarangayName(mappedBarangay) === normalizedBarangayName(row.barangay.name);
  const centroid = linkedBarangayMatches ? geographyPoint(row.barangay?.centroid) : null;
  const precision = row.geocode_precision || row.raw_payload?.geocode_precision || "unknown";
  const geocodeIsSafe = !mappedBarangay || ["barangay", "road", "barangay_master"].includes(precision);
  const lat = hasFiniteCoordinates(row) ? Number(row.latitude) : boundaryPoint?.lat ?? centroid?.lat ?? (geocodeIsSafe ? Number(row.latitude) : Number.NaN);
  const lng = hasFiniteCoordinates(row) ? Number(row.longitude) : boundaryPoint?.lng ?? centroid?.lng ?? (geocodeIsSafe ? Number(row.longitude) : Number.NaN);
  const date = scraperEventDate(row);
  const verifiedLocationText = [mappedBarangay, mappedMunicipality, "Isabela, Philippines"].filter(Boolean).join(", ");
  const confidence = row.location_confidence || row.raw_payload?.location_confidence || {};
  const basePrecision = boundaryPoint?.precision || (centroid ? "barangay_master" : precision);
  const baseSource = confidence.source || boundaryPoint?.source || (centroid ? "Supabase barangay centroid" : row.raw_payload?.geocoded_from || "geocoder");
  const baseMapping = boundaryPoint ? "matched_barangay" : row.mapping_status || "needs_review";
  const assessment = locationAssessment({
    locationConfidence: confidence,
    locationPrecision: basePrecision,
    mappingStatus: baseMapping,
    coordinateSource: baseSource,
    sourceKind: "reviewed_scraped",
  });

  return {
    id: `SCR-${String(row.id).slice(0, 8)}`,
    recordId: row.id,
    sourceKind: row.related_incident_id || row.status === "promoted" || row.status === "imported"
      ? "promoted_scraped"
      : row.public_visible || row.status === "verified" || row.status === "approved" || row.status === "matched"
        ? "reviewed_scraped"
        : "scraped",
    sourceLabel: row.source?.name || row.source_site || "External source",
    externalSourceUrl: row.source_url,
    type,
    severity: severityToMapSeverity(row.severity, type),
    barangay: mappedBarangay,
    municipality: mappedMunicipality,
    location: verifiedLocationText || row.location_text || row.display_name || row.barangay?.name || "Location from external source",
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    coordinates: latLngToPercentCoordinates(lat, lng),
    date: formatManilaDate(date),
    time: formatManilaTime(date),
    incidentDateTimeSource: scraperEventDateSource(row),
    incidentDateTimeEvidence: row.raw_payload?.incident_time_evidence || "",
    status: row.related_incident_id ? "on_scene" : "in_route",
    assignedTeam: row.related_incident_id ? "Imported to ALERT-CIA" : "External monitoring",
    description: row.snippet || row.title || "External incident candidate from scraper.",
    title: row.title || "",
    reportedBy: row.source_site || "Scraper",
    publicVisible: Boolean(row.public_visible),
    scraperStatus: row.status,
    barangayBoundary: boundaryPoint?.feature || null,
    locationPrecision: basePrecision,
    coordinateSource: baseSource,
    mappingStatus: baseMapping,
    matchConfidence: boundaryPoint ? 1 : Number(row.match_confidence || 0),
    locationConfidence: confidence,
    locationAccuracy: assessment.accuracy,
    locationConfidenceLevel: assessment.level,
    locationAccuracyLabel: assessment.label,
    pointHotspotEligible: assessment.pointHotspotEligible,
    approximateLocation: assessment.approximate,
    originalLocationSnapshot: row.original_location_snapshot || null,
    locationCorrectedBy: row.location_corrected_by || null,
    locationCorrectedAt: row.location_corrected_at || null,
  };
}

async function scraperRowsToMapIncidents(rows = []) {
  return Promise.all(rows.map(async (row) => {
    const location = row.raw_payload?.location || {};
    const boundaryPoint = !hasFiniteCoordinates(row)
      ? await resolveIsabelaBarangayGeometry({
        barangay: row.verified_barangay || row.extracted_barangay || location.barangay || row.barangay?.name,
        municipality: row.verified_municipality || row.extracted_municipality || location.municipality || row.barangay?.municipality,
      })
      : null;
    return scraperRecordToMapIncident(row, boundaryPoint);
  }));
}

export async function listScraperSources() {
  return runSupabaseRequest(client =>
    client.from("scraper_sources").select("*").eq("active", true).order("name", { ascending: true }),
  "Unable to load scraper sources.");
}

export async function triggerScraperRefresh({ type = "vehicular", mode = "update", sourceKey = null, pageFrom = null, pageTo = null, signal } = {}) {
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
  if (pageFrom) params.set("pageFrom", String(pageFrom));
  if (pageTo) params.set("pageTo", String(pageTo));

  try {
    response = await fetch(`${apiBaseUrl}/api/run?${params.toString()}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
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

export async function triggerFullScraperRefreshBySource({ type = "vehicular", onSourceStart, signal } = {}) {
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
    if (signal?.aborted) throw new DOMException("Scrape cancelled.", "AbortError");
    const sourceKey = source.source_key || source.key;
    const maxPages = Number(source.metadata?.max_pages_full || 100);
    for (let pageFrom = 1; pageFrom <= maxPages; pageFrom += FULL_SCRAPE_PAGE_CHUNK_SIZE) {
      if (signal?.aborted) throw new DOMException("Scrape cancelled.", "AbortError");
      const pageTo = Math.min(pageFrom + FULL_SCRAPE_PAGE_CHUNK_SIZE - 1, maxPages);
      onSourceStart?.({ source, index: index + 1, total: targets.length, pageFrom, pageTo, maxPages });
      try {
        const result = await triggerScraperRefresh({ type, mode: "full", sourceKey, pageFrom, pageTo, signal });
        totals.sources_checked += result.sources_checked || 0;
        totals.pages_checked += result.pages_checked || 0;
        totals.articles_checked += result.articles_checked || 0;
        totals.new_incidents += result.new_incidents || 0;
        totals.merged_incidents += result.merged_incidents || 0;
        totals.duplicates_skipped += result.duplicates_skipped || 0;
        totals.failed_requests += result.failed_requests || 0;
        if (Array.isArray(result.data)) totals.data.push(...result.data);
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) throw error;
        totals.success = false;
        totals.failed_sources.push({
          source_key: sourceKey,
          name: source.name || sourceKey,
          page_from: pageFrom,
          page_to: pageTo,
          error: error.message || "Source scrape failed.",
        });
      }
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

export async function analyzeScraperArticle({ url = "", title = "", snippet = "", body = "" } = {}, { signal } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase authentication is required to analyze scraper articles.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again before analyzing scraper articles.");

  const apiBaseUrl = getConfiguredScraperApiUrl();
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, title, snippet, body }),
      signal,
    });
  } catch (requestError) {
    if (requestError?.name === "AbortError") throw requestError;
    throw new Error(`Scraper analyzer at ${apiBaseUrl} could not be reached.`);
  }
  const payload = await readJsonResponse(response);
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Scraper analyzer returned ${response.status}.`);
  }
  return payload;
}

export async function listScraperSourceHealth() {
  const rows = await runSupabaseRequest(client =>
    client
      .from("scraper_source_health")
      .select("*")
      .order("status", { ascending: true })
      .order("updated_at", { ascending: false }),
  "Unable to load scraper source health.");
  return asRows(rows).map(scraperSourceHealthToApp);
}

export async function listScraperRecords({ status, category, sourceId, municipality, barangay, confidence, dateFrom, dateTo, limit = 100, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("scraper_records")
      .select("*, barangay:barangays(id, name, municipality, province), source:scraper_sources(id, name, source_key)")
      .eq("source_site", ACTIVE_SCRAPER_SOURCE_SITE)
      .ilike("source_url", ACTIVE_SCRAPER_SOURCE_URL_PATTERN)
      .is("deleted_at", null)
      .order("scraped_at", { ascending: false })
      .range(from, from + limit - 1);
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (sourceId) query = query.eq("source_id", sourceId);
    if (municipality) query = query.or(`extracted_municipality.ilike.%${municipality}%,verified_municipality.ilike.%${municipality}%`);
    if (barangay) query = query.ilike("extracted_barangay", `%${barangay}%`);
    if (confidence) query = query.eq("classification_confidence", confidence);
    if (dateFrom) query = query.gte("scraped_at", `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte("scraped_at", `${dateTo}T23:59:59.999`);
    return query;
  }, "Unable to load scraper records.");

  return asRows(rows).map(scraperRecordToApp);
}

export async function listRejectedScraperCandidates({ reason, sourceId, municipality, confidence, dateFrom, dateTo, limit = 100, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("scraper_article_candidates")
      .select("*, source:scraper_sources(id, name, source_key)")
      .eq("source_site", ACTIVE_SCRAPER_SOURCE_SITE)
      .ilike("source_url", ACTIVE_SCRAPER_SOURCE_URL_PATTERN)
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);
    if (reason) query = query.eq("rejection_reason", reason);
    if (sourceId) query = query.eq("source_id", sourceId);
    if (municipality) query = query.ilike("extracted_municipality", `%${municipality}%`);
    if (confidence) query = query.eq("classification_confidence", confidence);
    if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999`);
    return query;
  }, "Unable to load rejected scraper candidates.");
  return asRows(rows).map(scraperCandidateToApp);
}

export async function listVerifiedScrapedAnalyticsIncidents({ limit = 1000 } = {}) {
  const rows = await runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .select("*, barangay:barangays(id, name, municipality, province), source:scraper_sources(id, name, source_key)")
      .eq("source_site", ACTIVE_SCRAPER_SOURCE_SITE)
      .ilike("source_url", ACTIVE_SCRAPER_SOURCE_URL_PATTERN)
      .in("status", ["approved", "promoted", "matched", "imported"])
      .is("deleted_at", null)
      .order("scraped_at", { ascending: false })
      .limit(limit),
  "Unable to load verified scraped analytics records.");
  return asRows(rows).filter(isAccidentMapRow).map(scraperRecordToAnalyticsIncident);
}

export async function listPublicScrapedMapIncidents({ limit = 100 } = {}) {
  if (!isSupabaseConfigured) return [];
  const cacheKey = `alert-cia:public-scraped-map:${limit}`;

  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("scraper_records")
        .select("*, barangay:barangays(id, name, municipality, province, centroid)")
        .eq("source_site", ACTIVE_SCRAPER_SOURCE_SITE)
        .ilike("source_url", ACTIVE_SCRAPER_SOURCE_URL_PATTERN)
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

export async function listOfficerScrapedMapIncidents({ limit = 500, includeUnverified = true } = {}) {
  if (!isSupabaseConfigured) return [];

  const selectColumns = "*, barangay:barangays(id, name, municipality, province, centroid), source:scraper_sources(id, name, source_key)";
  const reviewedStatuses = ["approved", "promoted", "matched", "imported"];
  const pendingStatuses = ["pending_review", "new"];
  const buildQuery = (client, statuses, rowLimit) => client
      .from("scraper_records")
      .select(selectColumns)
      .eq("source_site", ACTIVE_SCRAPER_SOURCE_SITE)
      .ilike("source_url", ACTIVE_SCRAPER_SOURCE_URL_PATTERN)
      .in("status", statuses)
      .is("deleted_at", null)
      .order("scraped_at", { ascending: false })
      .limit(rowLimit);

  const reviewedRows = await runSupabaseRequest(
    client => buildQuery(client, reviewedStatuses, limit),
    "Unable to load verified scraper map incidents.",
  );
  let pendingRows = [];
  if (includeUnverified) {
    pendingRows = await runSupabaseRequest(
      client => buildQuery(client, pendingStatuses, Math.min(limit, 200)),
      "Unable to load pending scraper map incidents.",
    ).catch(() => []);
  }
  const rowsById = new Map([...asRows(reviewedRows), ...asRows(pendingRows)].map(row => [row.id, row]));
  return scraperRowsToMapIncidents([...rowsById.values()].filter(isAccidentMapRow));
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
  const userResult = supabase ? await supabase.auth.getUser().catch(() => null) : null;
  const verifiedBy = userResult?.data?.user?.id || null;
  return runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .update({
        status: "approved",
        public_visible: true,
        needs_manual_review: false,
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("*, barangay:barangays(id, name)")
      .single(),
  "Unable to approve scraper record for public map.").then(scraperRecordToApp);
}

export async function rejectScraperRecord(recordId, reason = "Rejected during review.") {
  return runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .update({
        status: "ignored",
        public_visible: false,
        needs_manual_review: false,
        rejected_reason: reason,
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("*, barangay:barangays(id, name, municipality, province)")
      .single(),
  "Unable to reject scraper record.").then(scraperRecordToApp);
}

export async function correctScraperRecordLocation(recordId, location = {}) {
  const userResult = supabase ? await supabase.auth.getUser().catch(() => null) : null;
  const correctedBy = userResult?.data?.user?.id || null;
  const accuracy = location.accuracy || "barangay_only";
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const hasCoordinates = location.latitude !== "" && location.latitude !== null && location.latitude !== undefined
    && location.longitude !== "" && location.longitude !== null && location.longitude !== undefined
    && Number.isFinite(lat) && Number.isFinite(lng);
  const level = accuracy === "unmapped" ? "unmapped" : accuracy === "near_exact" && hasCoordinates ? "high" : accuracy === "road_level" && hasCoordinates ? "medium" : "low";
  const effectiveAccuracy = level === "low" && accuracy !== "unmapped" ? "barangay_only" : accuracy;
  const source = effectiveAccuracy === "near_exact"
    ? "manual_exact"
    : effectiveAccuracy === "road_level"
      ? "road"
      : effectiveAccuracy === "unmapped"
        ? "unmapped"
        : "barangay_centroid";

  return runSupabaseRequest(async client => {
    const current = await client
      .from("scraper_records")
      .select("location_text, raw_location_text, display_name, latitude, longitude, verified_municipality, verified_barangay, verified_purok_sitio, verified_road_place, geocode_precision, mapping_status, location_confidence, original_location_snapshot")
      .eq("id", recordId)
      .maybeSingle();
    if (current.error) return current;

    const originalSnapshot = current.data?.original_location_snapshot || {
      location_text: current.data?.location_text || null,
      raw_location_text: current.data?.raw_location_text || null,
      display_name: current.data?.display_name || null,
      latitude: current.data?.latitude ?? null,
      longitude: current.data?.longitude ?? null,
      verified_municipality: current.data?.verified_municipality || null,
      verified_barangay: current.data?.verified_barangay || null,
      verified_purok_sitio: current.data?.verified_purok_sitio || null,
      verified_road_place: current.data?.verified_road_place || null,
      geocode_precision: current.data?.geocode_precision || null,
      mapping_status: current.data?.mapping_status || null,
      location_confidence: current.data?.location_confidence || {},
    };

    return client
      .from("scraper_records")
      .update({
        verified_municipality: location.municipality || null,
        verified_barangay: location.barangay || null,
        verified_purok_sitio: location.purokSitio || null,
        verified_road_place: location.road || null,
        extracted_municipality: location.municipality || null,
        extracted_barangay: location.barangay || null,
        purok_sitio: location.purokSitio || null,
        location_text: [location.road, location.purokSitio, location.barangay, location.municipality, "Isabela, Philippines"].filter(Boolean).join(", "),
        latitude: hasCoordinates ? lat : null,
        longitude: hasCoordinates ? lng : null,
        geocode_precision: source,
        mapping_status: effectiveAccuracy === "unmapped" ? "needs_review" : hasCoordinates ? "exact_geocode" : "matched_barangay",
        match_confidence: level === "high" ? 1 : level === "medium" ? 0.75 : level === "low" ? 0.45 : 0,
        location_confidence: {
          ...(current.data?.location_confidence || {}),
          source,
          level,
          accuracy: effectiveAccuracy,
          reason: location.reason || "Manual officer location correction.",
          corrected: true,
        },
        original_location_snapshot: originalSnapshot,
        location_corrected_by: correctedBy,
        location_corrected_at: new Date().toISOString(),
        needs_manual_review: true,
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("*, barangay:barangays(id, name, municipality, province)")
      .single();
  }, "Unable to correct scraper record location.").then(scraperRecordToApp);
}

export async function addOfficerVerifiedLandmarkFromCorrection(record = {}, location = {}) {
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Latitude and longitude are required before adding a verified landmark.");
  }
  const name = String(location.landmarkName || location.road || record.rawPayload?.location?.landmark || "").trim();
  if (!name) throw new Error("Landmark name is required.");

  const userResult = supabase ? await supabase.auth.getUser().catch(() => null) : null;
  const verifiedBy = userResult?.data?.user?.id || null;
  const aliases = String(location.aliases || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const municipality = location.municipality || record.verifiedMunicipality || record.extractedMunicipality || "Echague";
  const barangay = location.barangay || record.verifiedBarangay || record.extractedBarangay || null;
  const category = location.landmarkCategory || "other";
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, "");

  return runSupabaseRequest(async client => {
    let existingQuery = client
      .from("landmarks")
      .select("*")
      .eq("normalized_name", normalizedName)
      .ilike("municipality", municipality)
      .eq("category", category)
      .is("deleted_at", null)
      .limit(1);
    existingQuery = barangay ? existingQuery.ilike("barangay", barangay) : existingQuery.is("barangay", null);
    const existing = await existingQuery.maybeSingle();
    if (existing.error) return existing;
    if (existing.data) {
      return client
        .from("landmarks")
        .update({
          aliases: [...new Set([...(existing.data.aliases || []), ...aliases])],
          latitude: lat,
          longitude: lng,
          verification_status: "officer_verified",
          officer_verified: true,
          verified_by: verifiedBy,
          verified_at: new Date().toISOString(),
        })
        .eq("id", existing.data.id)
        .select("*")
        .single();
    }

    const inserted = await client
      .from("landmarks")
      .upsert({
        name,
        aliases,
        category,
        barangay,
        municipality,
        province: "Isabela",
        latitude: lat,
        longitude: lng,
        source: "officer",
        source_id: record.id ? `scraper-record:${record.id}` : null,
        verification_status: "officer_verified",
        officer_verified: true,
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        metadata: {
          created_from: "scraper_review_correction",
          scraper_record_id: record.id || null,
          source_url: record.sourceUrl || null,
          note: location.reason || null,
        },
      }, { onConflict: "source,source_id" })
      .select("*")
      .single();
    if (inserted.error?.code !== "23505") return inserted;

    let duplicateQuery = client
      .from("landmarks")
      .select("*")
      .eq("normalized_name", normalizedName)
      .ilike("municipality", municipality)
      .eq("category", category)
      .is("deleted_at", null)
      .limit(1);
    duplicateQuery = barangay ? duplicateQuery.ilike("barangay", barangay) : duplicateQuery.is("barangay", null);
    return duplicateQuery.maybeSingle();
  },
  "Unable to add verified landmark.");
}

function landmarkRowToApp(row = {}) {
  return {
    id: row.id,
    name: row.name || "",
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    category: row.category || "other",
    barangay: row.barangay || "",
    municipality: row.municipality || "",
    province: row.province || "Isabela",
    latitude: row.latitude,
    longitude: row.longitude,
    validationStatus: row.validation_status || "unchecked",
    detectedBarangay: row.detected_barangay || "",
    detectedMunicipality: row.detected_municipality || "",
    verificationStatus: row.verification_status || "unverified",
    officerVerified: Boolean(row.officer_verified),
    source: row.source || "manual",
    sourceId: row.source_id || "",
    metadata: row.metadata || {},
    verifiedBy: row.verified_by || null,
    verifiedAt: row.verified_at || null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function parseAliases(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function safeSearchText(value = "") {
  return String(value).replace(/[,%]/g, " ").trim();
}

export async function listLandmarks({ search = "", municipality = "", category = "", verificationStatus = "", validationStatus = "", limit = 200 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("landmarks")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (municipality) query = query.ilike("municipality", `%${safeSearchText(municipality)}%`);
    if (category) query = query.eq("category", category);
    if (verificationStatus) query = query.eq("verification_status", verificationStatus);
    if (validationStatus) query = query.eq("validation_status", validationStatus);
    const searchText = safeSearchText(search);
    if (searchText) {
      query = query.or(`name.ilike.%${searchText}%,barangay.ilike.%${searchText}%,municipality.ilike.%${searchText}%`);
    }
    return query;
  }, "Unable to load landmark registry.");

  const normalizedSearch = String(search || "").trim().toLowerCase();
  return asRows(rows)
    .map(landmarkRowToApp)
    .filter(row => !normalizedSearch || [
      row.name,
      row.barangay,
      row.municipality,
      ...row.aliases,
    ].some(value => String(value || "").toLowerCase().includes(normalizedSearch)));
}

export async function saveLandmark(landmark = {}) {
  const lat = Number(landmark.latitude);
  const lng = Number(landmark.longitude);
  if (!landmark.name?.trim()) throw new Error("Landmark name is required.");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Valid latitude and longitude are required.");

  const userResult = supabase ? await supabase.auth.getUser().catch(() => null) : null;
  const userId = userResult?.data?.user?.id || null;
  const officerVerified = Boolean(landmark.officerVerified);
  const payload = {
    name: landmark.name.trim(),
    aliases: parseAliases(landmark.aliases),
    category: landmark.category || "other",
    barangay: landmark.barangay || null,
    municipality: landmark.municipality || null,
    province: landmark.province || "Isabela",
    latitude: lat,
    longitude: lng,
    source: landmark.source || "manual",
    source_id: landmark.sourceId || null,
    verification_status: officerVerified ? "officer_verified" : (landmark.verificationStatus || "unverified"),
    officer_verified: officerVerified,
    verified_by: officerVerified ? (landmark.verifiedBy || userId) : null,
    verified_at: officerVerified ? (landmark.verifiedAt || new Date().toISOString()) : null,
    metadata: landmark.metadata || {},
  };

  const request = landmark.id
    ? client => client.from("landmarks").update(payload).eq("id", landmark.id).select("*").single()
    : client => client.from("landmarks").insert(payload).select("*").single();

  return runSupabaseRequest(request, "Unable to save landmark.").then(landmarkRowToApp);
}

export async function deleteLandmark(landmarkId) {
  return runSupabaseRequest(client =>
    client
      .from("landmarks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", landmarkId)
      .select("*")
      .single(),
  "Unable to remove landmark.").then(landmarkRowToApp);
}

export async function mergeScraperRecords(sourceRecordId, targetRecordId) {
  return runSupabaseRequest(client =>
    client.rpc("merge_scraper_records", {
      source_record_id: sourceRecordId,
      target_record_id: targetRecordId,
    }),
  "Unable to merge duplicate scraper records.");
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
