import { runSupabaseRequest, runSupabaseRequestWithMeta } from "./errors";
import { findBarangayByName } from "./referenceService";

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

const NOTES_EXTENDED_KEY = "__alertCiaExtended";
const COMPLETED_DISPATCH_STATUSES = ["pcr_completed", "verified"];
const COMPLETED_PCR_STATUSES = ["completed", "verified"];

function parseDescription(value) {
  if (!value || typeof value !== "string") return { text: "", extended: {} };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return {
        text: parsed.text || "",
        extended: parsed[NOTES_EXTENDED_KEY] || parsed.extended || {},
      };
    }
  } catch {
    return { text: value, extended: {} };
  }
  return { text: value, extended: {} };
}

function looksLikeCoordinates(value = "") {
  return /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(String(value));
}

function displayLocationText(...values) {
  const candidates = values.filter(value => value !== null && value !== undefined && String(value).trim());
  const named = candidates.find(value => !looksLikeCoordinates(value));
  return String(named || candidates[0] || "");
}

function classificationFromRecord(classification, extended = {}) {
  const source = String(extended.natureOfCall || extended.incidentNature || extended.typeOfIncident || classification || "").toLowerCase();
  if (source.includes("vehicle") || source.includes("crash") || source.includes("collision")) return "mvc";
  if (source.includes("fire")) return "fire";
  if (source.includes("flood") || source.includes("water")) return "flood";
  if (source.includes("medical") || source.includes("emergency")) return "medical";
  if (source.includes("crime") || source.includes("assault") || source.includes("violence")) return "crime";
  return classification || "other";
}

function summarizeDescription(text, extended = {}, response = {}) {
  if (text && !text.trim().startsWith("{")) return text;
  const patient = extended.patientName || response.patient_name;
  const age = extended.age || response.patient_age;
  const gender = extended.gender || response.patient_sex;
  const complaint = extended.chiefComplaint || response.initial_assessment;
  const nature = extended.natureOfCall || extended.incidentNature;
  const team = extended.respondingTeam || response.responding_team?.name || response.responding_teams?.name;
  const parts = [];
  if (patient) parts.push(`Patient: ${patient}${age ? `, ${age}` : ""}${gender ? ` ${gender}` : ""}`);
  if (nature) parts.push(`Nature: ${nature}`);
  if (complaint) parts.push(`Assessment: ${complaint}`);
  if (team) parts.push(`Responding team: ${team}`);
  return parts.join(". ") || "No narrative has been added for this incident yet.";
}

function incidentToApp(row = {}) {
  const descriptionParts = parseDescription(row.description);
  const response = row.response || row.responses || {};
  const classification = classificationFromRecord(row.classification || "other", descriptionParts.extended);
  const priority = row.priority || "medium";
  const status = row.status || "draft";
  const team = response.responding_team?.name || response.responding_teams?.name || "";
  const lat = row.latitude ?? row.lat ?? null;
  const lng = row.longitude ?? row.lon ?? null;
  const barangayName = row.barangay?.name || row.barangays?.name || descriptionParts.extended.barangay || "";
  const location = displayLocationText(
    barangayName,
    descriptionParts.extended.locationText,
    descriptionParts.extended.placeOfIncident,
    row.location_text,
    descriptionParts.extended.address,
  );

  return {
    id: row.id,
    responseId: row.response_id || null,
    barangayId: row.barangay_id || null,
    barangay: barangayName,
    classification,
    subtype: row.subtype || "",
    priority,
    type: classification === "mvc" ? "vehicular" : classification,
    severity: priority === "critical" ? "critical" : priority === "high" ? "warning" : priority === "low" ? "moderate" : "moderate",
    title: row.title || "",
    description: summarizeDescription(descriptionParts.text, descriptionParts.extended, response),
    date: row.incident_date,
    time: row.incident_time || "",
    location,
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

async function completedWorkflowResponseIds(client) {
  const [dispatchResult, pcrResult] = await Promise.all([
    client
      .from("dispatch_forms")
      .select("response_id")
      .in("status", COMPLETED_DISPATCH_STATUSES)
      .is("deleted_at", null)
      .limit(5000),
    client
      .from("pcr_reports")
      .select("response_id")
      .in("status", COMPLETED_PCR_STATUSES)
      .is("deleted_at", null)
      .limit(5000),
  ]);
  if (dispatchResult.error) return dispatchResult;
  if (pcrResult.error) return pcrResult;

  const dispatchResponseIds = new Set(asRows(dispatchResult.data).map(row => row.response_id).filter(Boolean));
  const responseIds = asRows(pcrResult.data)
    .map(row => row.response_id)
    .filter(responseId => responseId && dispatchResponseIds.has(responseId));

  return { data: [...new Set(responseIds)], error: null };
}

export async function listIncidents({ publicOnly = false, limit = 200, from = 0, status, type, severity, completedWorkflowOnly = false } = {}) {
  const classification = type === "vehicular" ? "mvc" : type;
  const priority = severity === "critical" ? "critical" : severity === "warning" ? "high" : severity === "moderate" ? "medium" : severity;
  const { data, count } = await runSupabaseRequestWithMeta(async client => {
    const completedResponseResult = completedWorkflowOnly ? await completedWorkflowResponseIds(client) : null;
    if (completedResponseResult?.error) return completedResponseResult;
    if (completedWorkflowOnly && !completedResponseResult.data.length) return { data: [], count: 0, error: null };

    if (publicOnly) {
      let query = client
        .from("incidents")
        .select("id, response_id, barangay_id, classification, subtype, priority, title, description, incident_date, incident_time, location_text, latitude, longitude, public_visible, record_origin, external_source_url, scraper_record_id, status, created_at, updated_at, barangay:barangays(id, name)", { count: "exact" })
        .eq("public_visible", true)
        .is("deleted_at", null)
        .order("incident_date", { ascending: false })
        .range(from, from + limit - 1);
      if (status) query = query.eq("status", status);
      if (classification) query = query.eq("classification", classification);
      if (priority) query = query.eq("priority", priority);
      if (completedWorkflowOnly) query = query.in("response_id", completedResponseResult.data);
      return query;
    }

    let query = client
      .from("incidents")
      .select("id, response_id, barangay_id, classification, subtype, priority, title, description, incident_date, incident_time, location_text, latitude, longitude, public_visible, record_origin, external_source_url, scraper_record_id, status, created_at, updated_at, barangay:barangays(id, name), response:responses(id, responding_team:responding_teams!responses_responding_team_id_fkey(id, name))", { count: "exact" })
      .is("deleted_at", null)
      .order("incident_date", { ascending: false })
      .range(from, from + limit - 1);
    if (status) query = query.eq("status", status);
    if (classification) query = query.eq("classification", classification);
    if (priority) query = query.eq("priority", priority);
    if (completedWorkflowOnly) query = query.in("response_id", completedResponseResult.data);
    return query;
  }, "Unable to load incidents.");

  const rows = asRows(data).map(incidentToApp);
  rows.totalCount = count ?? rows.length;
  return rows;
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
