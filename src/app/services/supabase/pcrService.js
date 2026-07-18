import { runSupabaseRequest } from "./errors";
import { isValidIncidentCoordinate, pcrPayloadFromRecord, pcrToApp, responseLocationPayloadFromRecord, toDbPCRStatus } from "./mappers";

const PCR_SELECT = `
  *,
  response:responses(
    *,
    barangay:barangays(id, name, normalized_name, municipality, province, centroid),
    responding_team:responding_teams!responses_responding_team_id_fkey(id, name),
    assigned_unit:ambulance_units(id, call_sign, plate_number)
  ),
  dispatch:dispatch_forms(id, response_id),
  responding_team:responding_teams!pcr_reports_responding_team_id_fkey(id, name),
  field_officer:profiles!pcr_reports_field_officer_id_fkey(id, display_name, email),
  pcr_vital_signs(*),
  pcr_medications(*),
  pcr_interventions(*),
  pcr_attachments(*)
`;

const ADMIN_PCR_MAP_STATUSES = ["in_progress", "submitted", "verified", "completed"];
const PUBLIC_PCR_MAP_STATUSES = ["verified", "completed"];

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

export async function listPCRReports({ status, limit = 100, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("pcr_reports")
      .select(PCR_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);
    if (status) query = query.eq("status", toDbPCRStatus(status));
    return query;
  }, "Unable to load PCR reports.");

  return asRows(rows).map(pcrToApp);
}

function priorityToSeverity(priority = "medium") {
  if (priority === "critical") return "critical";
  if (priority === "high") return "warning";
  if (priority === "low") return "moderate";
  return "moderate";
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
  return ["verified", "completed", "resolved", "approved"].includes(String(status || "").trim().toLowerCase());
}

function pcrMapRowToIncident(row = {}, incident = {}, { publicSafe = false } = {}) {
  const response = row.response || {};
  const barangayPoint = geographyPoint(response.barangay?.centroid);
  const lat = incident.latitude ?? incident.lat ?? response.latitude ?? barangayPoint?.lat ?? null;
  const lng = incident.longitude ?? incident.lon ?? response.longitude ?? barangayPoint?.lng ?? null;
  const type = classificationToType(incident.classification || row.incident_nature || response.type_of_incident);
  const dateValue = response.date_of_incident || row.completed_at || row.submitted_at || row.created_at;
  const date = dateValue ? new Date(dateValue) : new Date();
  const relatedIncidentId = incident.id || null;
  const isCompleted = incident.status === "pcr_completed" || row.status === "completed";

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
    severity: priorityToSeverity(incident.priority || row.triage),
    severity_level: priorityToSeverity(incident.priority || row.triage),
    location: incident.location_text || response.location_text || response.place_of_incident || response.barangay?.name || "Mapped PCR response",
    location_name: incident.location_text || response.location_text || response.place_of_incident || response.barangay?.name || "Mapped PCR response",
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
    publicVisible: publicSafe || Boolean(incident.public_visible) || ["verified", "completed"].includes(row.status),
    is_verified: isVerifiedMapStatus(row.status),
    is_public_visible: publicSafe || Boolean(incident.public_visible) || isVerifiedMapStatus(row.status),
    pcrStatus: row.status,
    locationPrecision: incident.latitude && incident.longitude ? "incident_coordinates" : response.latitude && response.longitude ? "response_pin" : barangayPoint ? "barangay_centroid" : "unknown",
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
  return pcrRows
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
      severity: priorityToSeverity(row.priority),
      location: row.location_text || row.barangay || "Verified response area",
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
  const row = await runSupabaseRequest(client =>
    client.from("pcr_reports").select(PCR_SELECT).eq("response_id", responseId).maybeSingle(),
  "Unable to load linked PCR report.");

  return row ? pcrToApp(row) : null;
}

export async function savePCRReport(pcrId, record) {
  return runSupabaseRequest(async client => {
    if (record.responseId && isValidIncidentCoordinate(record.latitude, record.longitude)) {
      const { error: responseError } = await client
        .from("responses")
        .update(responseLocationPayloadFromRecord(record))
        .eq("id", record.responseId);
      if (responseError) return { data: null, error: responseError };
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

export async function archivePCRReport(pcrId) {
  return runSupabaseRequest(client =>
    client
      .from("pcr_reports")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", pcrId)
      .select("*")
      .single(),
  "Unable to archive PCR report.");
}
