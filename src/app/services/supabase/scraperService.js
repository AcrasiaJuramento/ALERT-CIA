import { runSupabaseRequest } from "./errors";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";

const scraperApiBaseUrl = import.meta.env.VITE_SCRAPER_API_URL || "http://localhost:3000";

const ECHAGUE_BOUNDS = {
  north: 16.765,
  south: 16.625,
  west: 121.57,
  east: 121.74,
};

function asRows(value) {
  return Array.isArray(value) ? value : [];
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

function scraperRecordToMapIncident(row = {}) {
  const type = incidentTypeToMapType(row);
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
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
  };
}

export async function listScraperSources() {
  return runSupabaseRequest(client =>
    client.from("scraper_sources").select("*").order("name", { ascending: true }),
  "Unable to load scraper sources.");
}

export async function triggerScraperRefresh({ type = "all" } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase authentication is required to refresh scraper data.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again before refreshing scraper data.");

  const response = await fetch(`${scraperApiBaseUrl.replace(/\/$/, "")}/api/run?type=${encodeURIComponent(type)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || "Unable to refresh scraper data.");
  }

  return payload;
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

  const rows = await runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .select("*")
      .eq("public_visible", true)
      .in("status", ["approved", "promoted", "matched", "imported"])
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("scraped_at", { ascending: false })
      .limit(limit),
  "Unable to load public scraper map incidents.");

  return asRows(rows).map(scraperRecordToMapIncident);
}

export async function listOfficerScrapedMapIncidents({ limit = 200 } = {}) {
  if (!isSupabaseConfigured) return [];

  const rows = await runSupabaseRequest(client =>
    client
      .from("scraper_records")
      .select("*, barangay:barangays(id, name), source:scraper_sources(id, name, source_key)")
      .in("status", ["pending_review", "approved", "promoted", "new", "matched", "imported"])
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("scraped_at", { ascending: false })
      .limit(limit),
  "Unable to load officer scraper map incidents.");

  return asRows(rows).map(scraperRecordToMapIncident);
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
