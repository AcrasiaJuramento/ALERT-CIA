import { queryPublicView, invalidatePublicData } from './publicDataService';
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

function priorityToMapSeverity(priority = "medium", extended = {}) {
  const normalized = String(extended.pcrTriage || extended.triage || extended.triageLevel || priority || "").trim().toLowerCase();
  if (normalized === "black") return "black";
  if (normalized === "red" || normalized === "critical" || normalized === "high" || normalized === "warning") return "red";
  if (normalized === "yellow" || normalized === "medium" || normalized === "moderate") return "yellow";
  if (normalized === "green" || normalized === "low") return "green";
  return "yellow";
}

function triageRank(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "black") return 4;
  if (normalized === "red" || normalized === "critical" || normalized === "high" || normalized === "warning") return 3;
  if (normalized === "yellow" || normalized === "medium" || normalized === "moderate") return 2;
  if (normalized === "green" || normalized === "low") return 1;
  return 0;
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
  const attachments = asRows(row.incident_media).map(media => ({
    id: media.id,
    name: media.file_name || media.storage_path?.split("/").pop() || "Incident attachment",
    type: media.media_type || "photo",
    storagePath: media.storage_path || "",
    capturedAt: media.created_at || "",
    source: "incident",
  }));
  const classification = classificationFromRecord(row.classification || "other", descriptionParts.extended);
  const priority = row.priority || "medium";
  const status = row.status || "draft";
  const team = response.responding_team?.name || response.responding_teams?.name || "";
  const lat = row.latitude ?? row.lat ?? null;
  const lng = row.longitude ?? row.lon ?? null;
  const rawBarangayName = row.barangay?.name || row.barangays?.name || descriptionParts.extended.barangay || "";
  const barangayName = looksLikeCoordinates(rawBarangayName) ? "" : rawBarangayName;
  const location = displayLocationText(
    descriptionParts.extended.locationText,
    descriptionParts.extended.placeOfIncident,
    row.location_text,
    barangayName,
    descriptionParts.extended.address,
    rawBarangayName,
  );

  return {
    id: row.id,
    responseId: row.response_id || null,
    barangayId: row.barangay_id || null,
    barangay: barangayName,
    classification,
    subtype: row.subtype || "",
    natureOfCall: row.pcrNatureOfCall || descriptionParts.extended.natureOfCall || "",
    incidentNature: row.pcrIncidentNature || descriptionParts.extended.incidentNature || "",
    natureTypes: asRows(descriptionParts.extended.natureTypes),
    emergencyTypes: [...new Set([...asRows(row.pcrEmergencyTypes), ...asRows(descriptionParts.extended.emergencyTypes)])],
    traumaTypes: [...new Set([...asRows(row.pcrTraumaTypes), ...asRows(descriptionParts.extended.traumaTypes)])],
    priority,
    type: classification === "mvc" ? "vehicular" : classification,
    triage: row.pcrTriage || descriptionParts.extended.triage || "",
    severity: priorityToMapSeverity(priority, { ...descriptionParts.extended, pcrTriage: row.pcrTriage }),
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
    casualties: Number(row.casualties || 0),
    publicVisible: row.public_visible,
    sourceKind: row.record_origin || "official",
    sourceLabel: row.record_origin === "promoted_scraped" ? "Promoted scraper record" : "Official incident record",
    externalSourceUrl: row.external_source_url || "",
    scraperRecordId: row.scraper_record_id || null,
    status,
    workflowStatus: row.workflowStatus || status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locationPrecision: Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? "official_incident_pin" : "unknown",
    coordinateSource: "official_incident_record",
    mappingStatus: Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? "exact_geocode" : "needs_review",
    attachments,
  };
}

async function casualtyCountsByResponse(responseIds = []) {
  const ids = [...new Set(responseIds.filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("dispatch_forms")
        .select("response_id, number_of_patients, dispatch_patients(id)")
        .in("response_id", ids)
        .is("deleted_at", null),
    "Unable to load dispatch patient counts.");

    return new Map(asRows(rows).map(row => {
      const patientCount = Number(row.number_of_patients);
      const fallbackCount = row.dispatch_patients?.length || 0;
      return [row.response_id, Number.isFinite(patientCount) ? patientCount : fallbackCount];
    }));
  } catch {
    return new Map();
  }
}

async function pcrMetadataByResponse(responseIds = []) {
  const ids = [...new Set(responseIds.filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("pcr_reports")
        .select("response_id, status, triage, emergency_types, trauma_types, incident_nature, notes, updated_at, created_at")
        .in("response_id", ids)
        .is("deleted_at", null)
        .limit(5000),
    "Unable to load PCR incident metadata.");

    const byResponse = new Map();
    asRows(rows).forEach(row => {
      if (!row.response_id) return;
      const notes = parseDescription(row.notes);
      const current = byResponse.get(row.response_id) || {
        triage: "",
        emergencyTypes: [],
        traumaTypes: [],
        natureOfCall: "",
        incidentNature: "",
        statuses: [],
        updatedAt: 0,
      };
      const nextRank = triageRank(row.triage);
      const currentRank = triageRank(current.triage);
      const nextUpdated = new Date(row.updated_at || row.created_at || 0).getTime();
      const isLatest = nextUpdated >= current.updatedAt;
      byResponse.set(row.response_id, {
        triage: nextRank > currentRank || (nextRank === currentRank && isLatest) ? row.triage || current.triage : current.triage,
        emergencyTypes: [...new Set([
          ...current.emergencyTypes,
          ...asRows(row.emergency_types),
          ...asRows(notes.extended.emergencyTypes),
        ])],
        traumaTypes: [...new Set([
          ...current.traumaTypes,
          ...asRows(row.trauma_types),
          ...asRows(notes.extended.traumaTypes),
        ])],
        natureOfCall: isLatest ? notes.extended.natureOfCall || current.natureOfCall : current.natureOfCall,
        incidentNature: isLatest ? row.incident_nature || notes.extended.incidentNature || current.incidentNature : current.incidentNature,
        statuses: [...new Set([...current.statuses, row.status].filter(Boolean))],
        updatedAt: Math.max(current.updatedAt, nextUpdated),
      });
    });
    return byResponse;
  } catch {
    return new Map();
  }
}

async function dispatchStatusesByResponse(responseIds = []) {
  const ids = [...new Set(responseIds.filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("dispatch_forms")
        .select("response_id, status")
        .in("response_id", ids)
        .is("deleted_at", null)
        .limit(5000),
    "Unable to load dispatch workflow statuses.");

    const byResponse = new Map();
    asRows(rows).forEach(row => {
      if (!row.response_id || !row.status) return;
      byResponse.set(row.response_id, [...new Set([...(byResponse.get(row.response_id) || []), row.status])]);
    });
    return byResponse;
  } catch {
    return new Map();
  }
}

function workflowStatus(incidentStatus, pcrMetadata = {}, dispatchStatuses = []) {
  const statuses = [...(pcrMetadata.statuses || []), ...dispatchStatuses];
  if (statuses.includes("pending_admin_verification")) return "pending_admin_verification";
  if (
    incidentStatus === "pcr_completed"
    || statuses.some(status => ["pcr_completed", "submitted", "completed", "verified"].includes(status))
  ) return "pcr_completed";
  return incidentStatus;
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

async function verifiedPCRResponseIds(client) {
  return client
    .from("pcr_reports")
    .select("response_id")
    .eq("status", "verified")
    .not("response_id", "is", null)
    .is("deleted_at", null)
    .limit(5000);
}

export async function listIncidents({ publicOnly = false, limit = 200, from = 0, status, type, severity, completedWorkflowOnly = false, verifiedMapOnly = false } = {}) {
  if (publicOnly) return listPublicIncidentMapRecords({ limit, from, status, type, severity, verifiedMapOnly: verifiedMapOnly || completedWorkflowOnly });
  const classification = type === "vehicular" ? "mvc" : type;
  const priority = severity === "critical" ? "critical" : severity === "warning" ? "high" : severity === "moderate" ? "medium" : severity;
  const { data, count } = await runSupabaseRequestWithMeta(async client => {
    const completedResponseResult = completedWorkflowOnly ? await completedWorkflowResponseIds(client) : null;
    if (completedResponseResult?.error) return completedResponseResult;
    if (completedWorkflowOnly && !completedResponseResult.data.length) return { data: [], count: 0, error: null };
    const verifiedResponseResult = verifiedMapOnly ? await verifiedPCRResponseIds(client) : null;
    if (verifiedResponseResult?.error) return verifiedResponseResult;
    const verifiedResponseIds = asRows(verifiedResponseResult?.data).map(row => row.response_id).filter(Boolean);
    if (verifiedMapOnly && !verifiedResponseIds.length) return { data: [], count: 0, error: null };


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
    if (verifiedMapOnly) query = query.in("response_id", verifiedResponseIds);
    return query;
  }, "Unable to load incidents.");

  const baseRows = asRows(data);
  const responseIds = baseRows.map(row => row.response_id);
  const [casualtiesByResponse, pcrMetadataByResponseId, dispatchStatusesByResponseId] = await Promise.all([
    casualtyCountsByResponse(responseIds),
    pcrMetadataByResponse(responseIds),
    dispatchStatusesByResponse(responseIds),
  ]);
  const rows = baseRows.map(row => {
    const pcrMetadata = pcrMetadataByResponseId.get(row.response_id) || {};
    return incidentToApp({
      ...row,
      casualties: casualtiesByResponse.get(row.response_id) || 0,
      pcrTriage: pcrMetadata.triage || "",
      pcrEmergencyTypes: pcrMetadata.emergencyTypes || [],
      pcrTraumaTypes: pcrMetadata.traumaTypes || [],
      pcrNatureOfCall: pcrMetadata.natureOfCall || "",
      pcrIncidentNature: pcrMetadata.incidentNature || "",
      workflowStatus: workflowStatus(row.status, pcrMetadata, dispatchStatusesByResponseId.get(row.response_id) || []),
    });
  });
  rows.totalCount = count ?? rows.length;
  return rows;
}

export async function listPublicIncidentMapRecords(options = {}) {
  const { status, type, severity, verifiedMapOnly = false } = options;
  const rows = await queryPublicView('public_map_incidents_view',
    'id, classification, priority, title, incident_date, incident_time, location_text, latitude, longitude, status, barangay_name, is_verified, map_severity', options,
    { status, classification: type === 'vehicular' ? 'mvc' : type,
      priority: severity === 'warning' ? 'high' : severity === 'moderate' ? 'medium' : severity,
      is_verified: verifiedMapOnly ? true : undefined });
  return rows.map(row => ({ ...incidentToApp({ ...row, public_visible: true,
    barangay: { name: row.barangay_name }, pcrTriage: row.map_severity }),
    is_verified: row.is_verified, description: 'Verified emergency response activity. Follow official guidance.' }));
}

export async function getIncident(incidentId) {
  const row = await runSupabaseRequest(client =>
    client
      .from("incidents")
      .select("*, incident_media(*), barangay:barangays(id, name), response:responses(id, responding_team:responding_teams!responses_responding_team_id_fkey(id, name))")
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
  "Unable to create incident.").then(row => { invalidatePublicData(); return incidentToApp(row); });
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
  "Unable to update incident.").then(row => { invalidatePublicData(); return incidentToApp(row); });
}

export async function archiveIncident(incidentId) {
  return runSupabaseRequest(client =>
    client
      .from("incidents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", incidentId)
      .select("*")
      .single(),
  "Unable to archive incident.").then(row => { invalidatePublicData(); return row; });
}

export async function getActiveIncidentCount() {
  const result = await runSupabaseRequestWithMeta(client => client.from('incidents')
    .select('id', { count: 'exact', head: true }).is('deleted_at', null)
    .not('status', 'in', '(completed,pcr_completed)'), 'Unable to load active incident count.');
  return result.count || 0;
}
