import { runSupabaseRequest } from "./errors";
import { findBarangayByName } from "./referenceService";

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

function incidentToApp(row = {}) {
  const classification = row.classification || "other";
  const priority = row.priority || "medium";
  const status = row.status || "draft";
  const response = row.response || row.responses || {};
  const team = response.responding_team?.name || response.responding_teams?.name || "";
  const lat = row.latitude ?? row.lat ?? null;
  const lng = row.longitude ?? row.lon ?? null;

  return {
    id: row.id,
    responseId: row.response_id || null,
    barangayId: row.barangay_id || null,
    barangay: row.barangay?.name || row.barangays?.name || "",
    classification,
    subtype: row.subtype || "",
    priority,
    type: classification === "mvc" ? "vehicular" : classification,
    severity: priority === "critical" ? "critical" : priority === "high" ? "warning" : priority === "low" ? "moderate" : "moderate",
    title: row.title || "",
    description: row.description || "",
    date: row.incident_date,
    time: row.incident_time || "",
    location: row.location_text || "",
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    assignedTeam: team || "Unassigned",
    responders: team ? 1 : 0,
    casualties: 0,
    publicVisible: row.public_visible,
    sourceKind: row.record_origin || "official",
    sourceLabel: row.record_origin === "promoted_scraped" ? "Promoted scraper record" : "Official incident record",
    externalSourceUrl: row.external_source_url || "",
    scraperRecordId: row.scraper_record_id || null,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function incidentPayload(record = {}, barangayId) {
  const payload = {
    response_id: record.responseId || null,
    barangay_id: barangayId || record.barangayId || null,
    classification: record.classification || record.type || "other",
    subtype: record.subtype || null,
    priority: record.priority || record.severity || "medium",
    title: record.title || null,
    description: record.description || null,
    incident_date: record.date || record.incidentDate || new Date().toISOString().slice(0, 10),
    incident_time: record.time || record.incidentTime || null,
    location_text: record.location || record.locationText || null,
    public_visible: Boolean(record.publicVisible),
    status: record.status || "draft",
  };
  const lat = Number(record.lat ?? record.latitude);
  const lng = Number(record.lng ?? record.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    payload.latitude = lat;
    payload.longitude = lng;
  }
  return payload;
}

export async function listIncidents({ publicOnly = false, limit = 200, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    if (publicOnly) {
      return client
        .from("incidents")
        .select("id, response_id, barangay_id, classification, subtype, priority, title, description, incident_date, incident_time, location_text, latitude, longitude, public_visible, record_origin, external_source_url, scraper_record_id, status, created_at, updated_at")
        .eq("public_visible", true)
        .is("deleted_at", null)
        .order("incident_date", { ascending: false })
        .range(from, from + limit - 1);
    }

    let query = client
      .from("incidents")
      .select("*, barangay:barangays(id, name), response:responses(id, responding_team:responding_teams!responses_responding_team_id_fkey(id, name))")
      .is("deleted_at", null)
      .order("incident_date", { ascending: false })
      .range(from, from + limit - 1);
    return query;
  }, "Unable to load incidents.");

  return asRows(rows).map(incidentToApp);
}

export async function getIncident(incidentId) {
  const row = await runSupabaseRequest(client =>
    client
      .from("incidents")
      .select("*, barangay:barangays(id, name), response:responses(id, responding_team:responding_teams!responses_responding_team_id_fkey(id, name))")
      .eq("id", incidentId)
      .maybeSingle(),
  "Unable to load incident.");

  return row ? incidentToApp(row) : null;
}

export async function createIncident(record) {
  const barangay = record.barangayId ? null : await findBarangayByName(record.barangay);
  return runSupabaseRequest(client =>
    client
      .from("incidents")
      .insert(incidentPayload(record, barangay?.id))
      .select("*, barangay:barangays(id, name)")
      .single(),
  "Unable to create incident.").then(incidentToApp);
}

export async function updateIncident(incidentId, record) {
  const barangay = record.barangayId ? null : await findBarangayByName(record.barangay);
  return runSupabaseRequest(client =>
    client
      .from("incidents")
      .update(incidentPayload(record, barangay?.id))
      .eq("id", incidentId)
      .select("*, barangay:barangays(id, name)")
      .single(),
  "Unable to update incident.").then(incidentToApp);
}

export async function archiveIncident(incidentId) {
  return runSupabaseRequest(client =>
    client
      .from("incidents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", incidentId)
      .select("*")
      .single(),
  "Unable to archive incident.");
}
