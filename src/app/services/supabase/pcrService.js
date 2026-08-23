import { runSupabaseRequest, runSupabaseRequestWithMeta } from "./errors";
import { isValidIncidentCoordinate, patientBirthdayFromRecord, pcrPayloadFromRecord, pcrToApp, responseLocationPayloadFromRecord, toDbPCRStatus } from "./mappers";
import { locationAssessment } from "../../utils/locationAccuracy";
import { randomUuid } from "../../utils/uuid";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

function validDate(value) {
  return typeof value === "string" && DATE_PATTERN.test(value);
}

function validNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(value) : null;
}

function lanDispatchParentPayload(record = {}) {
  const payload = { ...record };
  const uuidFields = ["id", "dispatchId", "dispatchClientId", "responseId", "responseClientId", "respondingTeamId", "vehicleId", "dispatchPatientId", "patientId"];
  uuidFields.forEach(field => {
    if (payload[field] && !validUuid(payload[field])) delete payload[field];
  });
  ["dateOfIncident", "birthday"].forEach(field => {
    if (payload[field] && !validDate(payload[field])) delete payload[field];
  });
  ["timeOfIncident", "dispatchedTime", "dispatchTime", "arrivalScene", "departureScene", "arrivalHospital", "departureHospital", "backToBase"].forEach(field => {
    if (payload[field] && !validTime(payload[field])) delete payload[field];
  });
  const latitude = validNumber(payload.latitude);
  const longitude = validNumber(payload.longitude);
  payload.latitude = latitude;
  payload.longitude = longitude;
  if (payload.age && !/^\d{1,3}$/.test(String(payload.age))) delete payload.age;
  if (payload.numberOfPatients && !/^\d+$/.test(String(payload.numberOfPatients))) delete payload.numberOfPatients;
  return payload;
}

const PCR_SELECT = `
  *,
  response:responses(
    *,
    barangay:barangays(id, name, normalized_name, municipality, province, centroid),
    responding_team:responding_teams!responses_responding_team_id_fkey(id, name),
    assigned_unit:ambulance_units(id, call_sign, plate_number)
  ),
  dispatch:dispatch_forms!pcr_reports_dispatch_form_id_fkey(id, response_id),
  responding_team:responding_teams!pcr_reports_responding_team_id_fkey(id, name),
  field_officer:profiles!pcr_reports_field_officer_id_fkey(id, display_name, email),
  pcr_vital_signs(*),
  pcr_medications(*),
  pcr_interventions(*),
  pcr_attachments(*)
`;

const PCR_LIGHT_SELECT = `
  id,
  client_generated_id,
  response_id,
  dispatch_form_id,
  dispatch_patient_id,
  responding_team_id,
  field_officer_id,
  workflow_origin,
  dispatcher_reviewed_at,
  admin_reviewed_at,
  return_remarks,
  status,
  triage,
  chief_complaint,
  emergency_types,
  trauma_types,
  incident_nature,
  hospital_name,
  resident_on_duty,
  endorsed_to,
  received_by,
  transfer_reason,
  notes,
  back_to_base_time,
  completed_at,
  submitted_at,
  created_at,
  updated_at,
  archived_at,
  archived_by
`;

const PCR_LIST_SELECT = `
  id,
  client_generated_id,
  response_id,
  dispatch_form_id,
  dispatch_patient_id,
  responding_team_id,
  field_officer_id,
  status,
  triage,
  chief_complaint,
  emergency_types,
  trauma_types,
  incident_nature,
  hospital_name,
  resident_on_duty,
  endorsed_to,
  received_by,
  transfer_reason,
  notes,
  back_to_base_time,
  completed_at,
  submitted_at,
  created_at,
  updated_at,
  archived_at,
  archived_by,
  response:responses(
    id,
    client_generated_id,
    response_number,
    date_of_incident,
    time_of_incident,
    place_of_incident,
    location_text,
    latitude,
    longitude,
    patient_name,
    patient_age,
    patient_birthday,
    patient_sex,
    patient_address,
    initial_assessment,
    responding_team_id,
    assigned_unit_id,
    resolved_at,
    status,
    barangay:barangays(id, name, normalized_name),
    responding_team:responding_teams!responses_responding_team_id_fkey(id, name),
    assigned_unit:ambulance_units(id, call_sign)
  ),
  dispatch:dispatch_forms!pcr_reports_dispatch_form_id_fkey(id, response_id)
`;

const ADMIN_PCR_MAP_STATUSES = ["in_progress", "submitted", "verified", "completed"];
const PUBLIC_PCR_MAP_STATUSES = ["verified"];
const PCR_STATUS_RANK = {
  verified: 0,
  completed: 1,
  submitted: 2,
  in_progress: 3,
  draft: 4,
};

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

export async function listPCRReports({ status, limit = 100, from = 0, archive = "active" } = {}) {
  const { data, count } = await runSupabaseRequestWithMeta(client => {
    let query = client
      .from("pcr_reports")
      .select(PCR_LIST_SELECT, { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);
    if (status) query = query.eq("status", toDbPCRStatus(status));
    if (archive === "active") query = query.is("archived_at", null);
    if (archive === "archived") query = query.not("archived_at", "is", null);
    return query;
  }, "Unable to load PCR reports.");

  const rows = asRows(data).map(pcrToApp);
  rows.totalCount = count ?? rows.length;
  return rows;
}

export async function getPCRDashboardCounts() {
  const rows = await runSupabaseRequest(client => client.rpc("get_pcr_dashboard_counts"), "Unable to load PCR dashboard counts.");
  const counts = Array.isArray(rows) ? rows[0] : rows;
  return {
    pendingAdminReview: Number(counts?.pending_admin_review || 0),
    verified: Number(counts?.verified || 0),
    returnedRejected: Number(counts?.returned_rejected || 0),
  };
}

function priorityToSeverity(priority = "medium") {
  const normalized = String(priority || "").trim().toLowerCase();
  if (normalized === "black") return "black";
  if (normalized === "red" || normalized === "critical" || normalized === "high" || normalized === "warning") return "red";
  if (normalized === "yellow" || normalized === "medium" || normalized === "moderate") return "yellow";
  if (normalized === "green" || normalized === "low") return "green";
  return "yellow";
}

function classificationToType(classification = "other") {
  if (classification === "mvc") return "vehicular";
  if (["fire", "medical", "flood"].includes(classification)) return classification;
  if (["violence", "crime"].includes(classification)) return "crime";
  return "other";
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

function isVerifiedMapStatus(status = "") {
  return ["verified", "resolved", "approved"].includes(String(status || "").trim().toLowerCase());
}

function looksLikeCoordinates(value = "") {
  return /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(String(value));
}

function displayLocationText(...values) {
  const candidates = values.filter(value => value !== null && value !== undefined && String(value).trim());
  const named = candidates.find(value => !looksLikeCoordinates(value));
  return String(named || candidates[0] || "");
}

function pcrStatusRank(status = "") {
  return PCR_STATUS_RANK[String(status || "").toLowerCase()] ?? 9;
}

function canonicalPcrRows(rows = []) {
  const byResponse = new Map();
  asRows(rows).forEach(row => {
    if (!row.response_id) return;
    const current = byResponse.get(row.response_id);
    if (!current) {
      byResponse.set(row.response_id, row);
      return;
    }
    const currentRank = pcrStatusRank(current.status);
    const nextRank = pcrStatusRank(row.status);
    const currentUpdated = new Date(current.updated_at || current.created_at || 0).getTime();
    const nextUpdated = new Date(row.updated_at || row.created_at || 0).getTime();
    if (nextRank < currentRank || (nextRank === currentRank && nextUpdated > currentUpdated)) {
      byResponse.set(row.response_id, row);
    }
  });
  return [...byResponse.values()];
}

function pcrMapRowToIncident(row = {}, incident = {}, { publicSafe = false } = {}) {
  const response = row.response || {};
  const barangayPoint = geographyPoint(response.barangay?.centroid);
  const hasIncidentCoordinates = Number.isFinite(Number(incident.latitude ?? incident.lat)) && Number.isFinite(Number(incident.longitude ?? incident.lon));
  const hasResponseCoordinates = Number.isFinite(Number(response.latitude)) && Number.isFinite(Number(response.longitude));
  const lat = hasIncidentCoordinates ? Number(incident.latitude ?? incident.lat) : hasResponseCoordinates ? Number(response.latitude) : barangayPoint?.lat ?? null;
  const lng = hasIncidentCoordinates ? Number(incident.longitude ?? incident.lon) : hasResponseCoordinates ? Number(response.longitude) : barangayPoint?.lng ?? null;
  const type = classificationToType(incident.classification || row.incident_nature || response.type_of_incident);
  const dateValue = response.date_of_incident || row.completed_at || row.submitted_at || row.created_at;
  const date = dateValue ? new Date(dateValue) : new Date();
  const relatedIncidentId = incident.id || null;
  const isCompleted = incident.status === "pcr_completed";
  const location = displayLocationText(incident.location_text, response.location_text, response.place_of_incident, response.barangay?.name, "Mapped PCR response");
  const precision = hasIncidentCoordinates ? "official_incident_pin" : hasResponseCoordinates ? "response_pin" : barangayPoint ? "barangay_centroid" : "unknown";
  const assessment = locationAssessment({
    sourceKind: "pcr_report",
    locationPrecision: precision,
    mappingStatus: Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? "exact_geocode" : "needs_review",
    coordinateSource: precision === "barangay_centroid" ? "barangay_centroid" : precision,
    locationConfidence: precision === "barangay_centroid"
      ? { level: "low", accuracy: "barangay_only", source: "barangay_centroid" }
      : { level: "high", accuracy: "near_exact", source: precision },
  });

  return {
    id: publicSafe ? `PCR-${String(row.id).slice(0, 8)}` : `PCR-${String(row.id).slice(0, 8)}`,
    recordId: row.id,
    relatedIncidentId,
    responseId: row.response_id,
    sourceKind: "pcr_report",
    source_type: "pcr_report",
    report_type: "Patient Care Report",
    sourceLabel: publicSafe ? "Verified response record" : "Patient Care Report",
    type,
    incident_type: type,
    severity: priorityToSeverity(row.triage || incident.priority),
    severity_level: priorityToSeverity(row.triage || incident.priority),
    location,
    location_name: location,
    barangay: response.barangay?.name || "",
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    date: date.toISOString().slice(0, 10),
    time: String(response.time_of_incident || "").slice(0, 5),
    incident_datetime: `${date.toISOString().slice(0, 10)} ${String(response.time_of_incident || "").slice(0, 5)}`.trim(),
    status: isCompleted ? "completed" : "on_scene",
    pcrStatusLabel: row.status,
    assignedTeam: publicSafe ? "Emergency responders" : response.responding_team?.name || "PCR response",
    title: publicSafe ? `${type} safety alert` : response.response_number || "PCR-linked incident",
    description: publicSafe
      ? "Emergency response activity has been confirmed in this area. Use caution nearby."
      : row.chief_complaint || row.incident_nature || response.initial_assessment || "PCR report linked to this response.",
    publicVisible: publicSafe || Boolean(incident.public_visible) || row.status === "verified",
    is_verified: isVerifiedMapStatus(row.status),
    is_public_visible: publicSafe || Boolean(incident.public_visible) || isVerifiedMapStatus(row.status),
    pcrStatus: row.status,
    locationPrecision: precision,
    coordinateSource: precision,
    mappingStatus: Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? "exact_geocode" : "needs_review",
    locationConfidence: assessment,
    locationAccuracy: assessment.accuracy,
    locationConfidenceLevel: assessment.level,
    locationAccuracyLabel: assessment.label,
    pointHotspotEligible: assessment.pointHotspotEligible,
    approximateLocation: assessment.approximate,
  };
}

export async function listPCRMapIncidents({ publicOnly = false, limit = 100 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("pcr_reports")
      .select(PCR_SELECT)
      .is("deleted_at", null)
      .in("status", publicOnly ? PUBLIC_PCR_MAP_STATUSES : ADMIN_PCR_MAP_STATUSES)
      .order("created_at", { ascending: false })
      .limit(limit);
    return query;
  }, "Unable to load PCR map reports.");

  const pcrRows = asRows(rows);
  const responseIds = pcrRows.map(row => row.response_id).filter(Boolean);
  if (!responseIds.length) return [];

  const incidents = await runSupabaseRequest(client => {
    let query = client
      .from("incidents")
      .select("id, response_id, classification, priority, title, description, incident_date, incident_time, location_text, latitude, longitude, public_visible, status, deleted_at")
      .in("response_id", responseIds)
      .is("deleted_at", null);
    return query;
  }, "Unable to load PCR map locations.");

  const incidentByResponse = new Map(asRows(incidents).map(incident => [incident.response_id, incident]));
  return canonicalPcrRows(pcrRows)
    .filter(row => !incidentByResponse.has(row.response_id))
    .map(row => {
      const incident = incidentByResponse.get(row.response_id);
      return pcrMapRowToIncident(row, incident, { publicSafe: publicOnly });
    })
    .filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)));
}

export async function listPublicPCRMapIncidents({ limit = 100 } = {}) {
  const rows = await runSupabaseRequest(client =>
    client.rpc("public_pcr_map_incidents", { max_rows: limit }),
  "Unable to load public PCR map records.");

  return asRows(rows).map(row => {
    const dateValue = row.incident_date ? new Date(row.incident_date) : new Date();
    return {
      id: `INC-${String(row.incident_id).slice(0, 8)}`,
      recordId: row.pcr_id,
      relatedIncidentId: row.incident_id,
      responseId: row.response_id,
      sourceKind: "pcr_report",
      sourceLabel: "Verified emergency response",
      type: classificationToType(row.classification),
      severity: priorityToSeverity(row.triage || row.priority),
      location: displayLocationText(row.barangay, row.location_text, "Verified response area"),
      barangay: row.barangay || "",
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      date: dateValue.toISOString().slice(0, 10),
      time: String(row.incident_time || "").slice(0, 5),
      status: row.incident_status === "pcr_completed" ? "completed" : "on_scene",
      assignedTeam: "Emergency responders",
      title: `${classificationToType(row.classification)} safety alert`,
      description: "Emergency response activity has been verified in this area. Keep distance and follow official guidance.",
      publicVisible: true,
    };
  });
}

export async function getPCRReport(pcrId) {
  const row = await runSupabaseRequest(client =>
    client.from("pcr_reports").select(PCR_SELECT).eq("id", pcrId).maybeSingle(),
  "Unable to load PCR report.");

  return row ? pcrToApp(row) : null;
}

export async function getPCRReportByResponse(responseId) {
  if (!responseId || responseId === "undefined") return null;
  const row = await runSupabaseRequest(client =>
    client.from("pcr_reports").select(PCR_SELECT).eq("response_id", responseId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  "Unable to load linked PCR report.");

  return row ? pcrToApp(row) : null;
}

export async function listPCRReportsByResponses(responseIds = []) {
  const ids = [...new Set(responseIds.filter(id => id && id !== "undefined"))];
  if (!ids.length) return [];
  const rows = await runSupabaseRequest(client =>
    client
      .from("pcr_reports")
      .select(PCR_LIGHT_SELECT)
      .in("response_id", ids)
      .order("updated_at", { ascending: false }),
  "Unable to load linked PCR reports.");
  const byResponse = new Map();
  for (const row of asRows(rows)) {
    if (!byResponse.has(row.response_id)) byResponse.set(row.response_id, row);
  }
  return [...byResponse.values()].map(pcrToApp);
}

export async function listPCRReportsByDispatches(dispatchIds = []) {
  const ids = [...new Set(dispatchIds.filter(id => id && id !== "undefined"))];
  if (!ids.length) return [];
  const rows = await runSupabaseRequest(client =>
    client
      .from("pcr_reports")
      .select(PCR_LIGHT_SELECT)
      .in("dispatch_form_id", ids)
      .order("updated_at", { ascending: false }),
  "Unable to load linked PCR reports.");
  const byDispatch = new Map();
  for (const row of asRows(rows)) {
    if (!byDispatch.has(row.dispatch_form_id)) byDispatch.set(row.dispatch_form_id, row);
  }
  return [...byDispatch.values()].map(pcrToApp);
}

export async function savePCRReport(pcrId, record) {
  return runSupabaseRequest(async client => {
    if (record.responseId) {
      const responsePatch = responseDemographicsPayloadFromPcr(record);
      if (Object.keys(responsePatch).length) {
        const { error: responseError } = await client
          .from("responses")
          .update(responsePatch)
          .eq("id", record.responseId);
        if (responseError) return { data: null, error: responseError };
      }
    }

    return client
      .from("pcr_reports")
      .update(pcrPayloadFromRecord(record))
      .eq("id", pcrId)
      .select(PCR_SELECT)
      .single();
  },
  "Unable to save PCR report.").then(pcrToApp);
}

async function selectCanonicalPcr(client, { responseId, pcrId }) {
  let query = client.from("pcr_reports").select(PCR_LIGHT_SELECT);
  if (pcrId) query = query.eq("id", pcrId);
  else query = query.eq("response_id", responseId);
  const result = await query.order("updated_at", { ascending: false }).limit(1);
  if (result.error) return result;
  return { data: result.data?.[0] || null, error: null };
}

function validDateTimeOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function responseDemographicsPayloadFromPcr(record = {}) {
  const age = Number(record.age);
  const payload = {
    ...(isValidIncidentCoordinate(record.latitude, record.longitude) ? responseLocationPayloadFromRecord(record) : {}),
    patient_name: record.patientName || null,
    patient_age: Number.isInteger(age) && age >= 0 ? age : null,
    patient_birthday: patientBirthdayFromRecord(record),
    patient_sex: record.gender || null,
    patient_address: record.address || null,
    initial_assessment: record.chiefComplaint || null,
  };
  Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);
  return payload;
}

function uuidCandidates(...values) {
  return [...new Set(values.filter(validUuid))];
}

async function findResponseByAnyId(client, ids = []) {
  const candidates = uuidCandidates(...ids);
  if (!candidates.length) return { data: null, error: null };

  const { data, error } = await client
    .from("responses")
    .select("id, client_generated_id, responding_team_id")
    .or(`id.in.(${candidates.join(",")}),client_generated_id.in.(${candidates.join(",")})`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return { data: null, error };
  return { data: data?.[0] || null, error: null };
}

async function findDispatchByAnyId(client, record = {}) {
  const dispatchIds = uuidCandidates(record.dispatchId, record.dispatchClientId, record.id);
  const responseIds = uuidCandidates(record.responseId, record.responseClientId);
  const filters = [];
  if (dispatchIds.length) filters.push(`id.in.(${dispatchIds.join(",")})`, `client_generated_id.in.(${dispatchIds.join(",")})`);
  if (responseIds.length) filters.push(`response_id.in.(${responseIds.join(",")})`);
  if (!filters.length) return { data: null, error: null };

  const { data, error } = await client
    .from("dispatch_forms")
    .select("id, client_generated_id, response_id, response:responses(id, client_generated_id, responding_team_id)")
    .or(filters.join(","))
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return { data: null, error };
  return { data: data?.[0] || null, error: null };
}

async function resolveCloudParentIds(client, record = {}) {
  const dispatchResult = await findDispatchByAnyId(client, record);
  if (dispatchResult.error) return { data: null, error: dispatchResult.error };
  if (dispatchResult.data?.response_id) {
    return {
      data: {
        ...record,
        responseId: dispatchResult.data.response_id,
        responseClientId: dispatchResult.data.response?.client_generated_id || record.responseClientId || record.responseId,
        dispatchId: dispatchResult.data.id,
        dispatchClientId: dispatchResult.data.client_generated_id || record.dispatchClientId || record.dispatchId,
        respondingTeamId: record.respondingTeamId || dispatchResult.data.response?.responding_team_id || null,
      },
      error: null,
    };
  }

  const responseResult = await findResponseByAnyId(client, [record.responseId, record.responseClientId]);
  if (responseResult.error) return { data: null, error: responseResult.error };
  if (!responseResult.data?.id) return { data: record, error: null };

  const dispatchByResponse = await findDispatchByAnyId(client, {
    ...record,
    responseId: responseResult.data.id,
    responseClientId: responseResult.data.client_generated_id || record.responseClientId,
  });
  if (dispatchByResponse.error) return { data: null, error: dispatchByResponse.error };

  return {
    data: {
      ...record,
      responseId: responseResult.data.id,
      responseClientId: responseResult.data.client_generated_id || record.responseClientId || record.responseId,
      dispatchId: dispatchByResponse.data?.id || record.dispatchId,
      dispatchClientId: dispatchByResponse.data?.client_generated_id || record.dispatchClientId || record.dispatchId,
      respondingTeamId: record.respondingTeamId || responseResult.data.responding_team_id || null,
    },
    error: null,
  };
}

async function resolveCloudDispatchFormId(client, record) {
  if (record.dispatchId) {
    const byId = await client
      .from("dispatch_forms")
      .select("id")
      .eq("id", record.dispatchId)
      .eq("response_id", record.responseId)
      .limit(1);
    if (byId.error) return { data: null, error: byId.error };
    if (byId.data?.[0]?.id) return { data: byId.data[0].id, error: null };
  }

  const byResponse = await client
    .from("dispatch_forms")
    .select("id")
    .eq("response_id", record.responseId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (byResponse.error) return { data: null, error: byResponse.error };
  return { data: byResponse.data?.[0]?.id || null, error: null };
}

async function ensureLanDispatchParent(client, record) {
  if (!record.responseId || !record.dispatchId) return { data: null, error: null };
  const { data: existingResponse, error: responseError } = await client
    .from("responses")
    .select("id, responding_team_id")
    .eq("id", record.responseId)
    .limit(1)
    .maybeSingle();
  if (responseError) return { data: null, error: responseError };
  if (existingResponse?.responding_team_id) return { data: existingResponse, error: null };

  const shouldMaterializeParent = record.source === "local_server"
    || record.localStatus
    || record.responseClientId
    || record.dispatchClientId;
  if (!shouldMaterializeParent) return { data: null, error: null };

  return client.rpc("sync_lan_dispatch_parent", {
    dispatch_payload: lanDispatchParentPayload({
      ...record,
      status: "PCR In Progress",
    }),
  });
}

export async function upsertPCRReport(record, { submit = false } = {}) {
  let pcrId = validUuid(record.pcrId) ? record.pcrId : validUuid(record.id) ? record.id : validUuid(record.pcrClientId) ? record.pcrClientId : randomUuid();
  if (!record.responseId) throw new Error("Linked response ID is required before synchronizing a PCR.");
  const syncStatus = submit || record.status === "Completed" || record.status === "Submitted Locally"
    ? "Submitted"
    : record.status;

  return runSupabaseRequest(async client => {
    const resolvedParent = await resolveCloudParentIds(client, record);
    if (resolvedParent.error) return { data: null, error: resolvedParent.error };
    let syncRecord = resolvedParent.data || record;

    const parentResult = await ensureLanDispatchParent(client, syncRecord);
    if (parentResult.error && parentResult.error.code !== "PGRST202" && parentResult.error.code !== "42883") {
      return parentResult;
    }
    if (parentResult.data?.id) {
      syncRecord = {
        ...syncRecord,
        dispatchId: parentResult.data.id,
        dispatchClientId: parentResult.data.client_generated_id || syncRecord.dispatchClientId || syncRecord.dispatchId,
        responseId: parentResult.data.response_id || syncRecord.responseId,
      };
      const refreshedParent = await resolveCloudParentIds(client, syncRecord);
      if (refreshedParent.error) return { data: null, error: refreshedParent.error };
      syncRecord = refreshedParent.data || syncRecord;
    }

    const { data: existingByResponse, error: existingError } = await client
      .from("pcr_reports")
      .select("id")
      .eq("response_id", syncRecord.responseId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) return { data: null, error: existingError };
    pcrId = existingByResponse?.id || (validUuid(pcrId) ? pcrId : randomUuid());

    if (syncRecord.workflowOrigin === "reverse") {
      return client
        .from("pcr_reports")
        .update({
          ...pcrPayloadFromRecord({ ...syncRecord, status: syncStatus }),
          workflow_origin: "reverse",
        })
        .eq("id", pcrId)
        .eq("workflow_origin", "reverse")
        .select(PCR_SELECT)
        .single();
    }

    const rpcPayload = { ...syncRecord, id: pcrId, pcrId };
    const normalizedBirthday = patientBirthdayFromRecord(rpcPayload);
    const serializedPayload = pcrPayloadFromRecord({ ...rpcPayload, birthday: normalizedBirthday || rpcPayload.birthday, status: syncStatus });
    const rpcResult = await client.rpc("sync_offline_pcr_report", {
      report_payload: { ...rpcPayload, birthday: normalizedBirthday || rpcPayload.birthday || null, status: syncStatus, notes: serializedPayload.notes },
      vital_payload: syncRecord.vitals || [],
      submit_report: submit,
    });
    if (!rpcResult.error) {
      return selectCanonicalPcr(client, { pcrId: rpcResult.data.id, responseId: syncRecord.responseId });
    }
    if (!["PGRST202", "42883", "57014"].includes(rpcResult.error.code)) {
      return rpcResult;
    }

    if (syncRecord.responseId) {
      const responsePatch = responseDemographicsPayloadFromPcr(syncRecord);
      if (Object.keys(responsePatch).length) {
        const { error: responseError } = await client
          .from("responses")
          .update(responsePatch)
          .eq("id", syncRecord.responseId);
        if (responseError) return { data: null, error: responseError };
      }
    }

    const dispatchFormId = await resolveCloudDispatchFormId(client, syncRecord);
    if (dispatchFormId.error) return dispatchFormId;

    const payload = {
      id: pcrId,
      response_id: syncRecord.responseId,
      dispatch_form_id: dispatchFormId.data,
      dispatch_patient_id: syncRecord.dispatchPatientId || syncRecord.patientId || null,
      responding_team_id: syncRecord.respondingTeamId || null,
      field_officer_id: syncRecord.fieldOfficerId || syncRecord.createdBy || null,
      ...pcrPayloadFromRecord({ ...syncRecord, birthday: normalizedBirthday || syncRecord.birthday, status: syncStatus }),
    };
    if (submit || syncStatus === "Submitted") payload.submitted_at = syncRecord.submittedAt || new Date().toISOString();

    const upsertResult = await client
      .from("pcr_reports")
      .upsert(payload, { onConflict: "response_id" })
      .select("id")
      .limit(1)
      .maybeSingle();
    if (upsertResult.error) return upsertResult;

    return selectCanonicalPcr(client, { pcrId: upsertResult.data.id, responseId: syncRecord.responseId });
  },
  "Unable to synchronize PCR report.").then(pcrToApp);
}

export async function submitPCRReport(pcrId) {
  return runSupabaseRequest(client =>
    client
      .from("pcr_reports")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", pcrId)
      .select(PCR_SELECT)
      .single(),
  "Unable to submit PCR report.").then(pcrToApp);
}

export async function replacePCRVitals(pcrReportId, vitals = []) {
  return runSupabaseRequest(async client => {
    const { error: deleteError } = await client.from("pcr_vital_signs").delete().eq("pcr_report_id", pcrReportId);
    if (deleteError) return { data: null, error: deleteError };
    if (!vitals.length) return { data: [], error: null };

    return client.from("pcr_vital_signs").insert(vitals.map(vital => ({
      pcr_report_id: pcrReportId,
      measured_time: vital.time || null,
      blood_pressure: vital.bp || null,
      pulse_rate: vital.pulse || null,
      respiratory_rate: vital.respiratory || null,
      temperature: vital.temperature || null,
      oxygen_saturation: vital.oxygen || null,
    }))).select("*");
  }, "Unable to save PCR vital signs.");
}

export async function replacePCRMedications(pcrReportId, medications = []) {
  return runSupabaseRequest(async client => {
    const { error: deleteError } = await client.from("pcr_medications").delete().eq("pcr_report_id", pcrReportId);
    if (deleteError) return { data: null, error: deleteError };
    const rows = medications.filter(medication => medication.drug || medication.dose || medication.dateTime);
    if (!rows.length) return { data: [], error: null };

    return client.from("pcr_medications").insert(rows.map(medication => ({
      pcr_report_id: pcrReportId,
      drug: medication.drug || null,
      dose: medication.dose || null,
      given_at: validDateTimeOrNull(medication.dateTime),
    }))).select("*");
  }, "Unable to save PCR medications.");
}

export async function replacePCRInterventions(pcrReportId, interventions = {}, interventionDetails = {}) {
  return runSupabaseRequest(async client => {
    const { error: deleteError } = await client.from("pcr_interventions").delete().eq("pcr_report_id", pcrReportId);
    if (deleteError) return { data: null, error: deleteError };
    const rows = Object.entries(interventions)
      .filter(([, result]) => result)
      .map(([name, result]) => ({
        pcr_report_id: pcrReportId,
        intervention_name: name,
        result,
        notes: interventionDetails[name] || null,
      }));
    if (!rows.length) return { data: [], error: null };

    return client.from("pcr_interventions").insert(rows).select("*");
  }, "Unable to save PCR interventions.");
}

export async function replacePCRAttachments(pcrReportId, attachments = []) {
  return runSupabaseRequest(async client => {
    const { error: deleteError } = await client.from("pcr_attachments").delete().eq("pcr_report_id", pcrReportId);
    if (deleteError) return { data: null, error: deleteError };
    const rows = attachments.filter(attachment => attachment.name || attachment.fileName || attachment.data);
    if (!rows.length) return { data: [], error: null };

    return client.from("pcr_attachments").insert(rows.map(attachment => ({
      pcr_report_id: pcrReportId,
      attachment_type: attachment.type || "document",
      storage_path: attachment.storagePath || null,
      file_name: attachment.name || attachment.fileName || null,
      metadata: {
        id: attachment.id || null,
        size: attachment.size || null,
        location: attachment.location || null,
        capturedAt: attachment.capturedAt || null,
        data: attachment.data || null,
      },
    }))).select("*");
  }, "Unable to save PCR attachments.");
}

export async function archivePCRReport(pcrId) {
  return runSupabaseRequest(client =>
    client.rpc("set_pcr_archived", { target_pcr_id: pcrId, should_archive: true }),
  "Unable to archive PCR report.");
}

export async function unarchivePCRReport(pcrId) {
  return runSupabaseRequest(client =>
    client.rpc("set_pcr_archived", { target_pcr_id: pcrId, should_archive: false }),
  "Unable to restore PCR report.");
}
