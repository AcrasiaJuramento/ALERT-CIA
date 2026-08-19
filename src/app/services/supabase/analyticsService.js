import { runSupabaseRequest } from "./errors";

const DISPATCH_STATUS_FROM_DB = {
  draft: "Draft",
  dispatched: "Dispatched",
  sent_to_responding_team: "Sent to Responding Team",
  accepted_by_responding_team: "Accepted by Responding Team",
  pcr_in_progress: "PCR In Progress",
  pcr_completed: "Submitted",
  completed: "Verified",
  cancelled: "Cancelled",
  pending_admin_verification: "Pending Admin Verification",
  verified: "Verified",
  returned_for_correction: "Returned for Correction",
};

const PCR_STATUS_FROM_DB = {
  draft: "Draft",
  in_progress: "In Progress",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  completed: "Submitted",
  pending_dispatcher_review: "Pending Dispatcher Review",
  accepted_by_dispatcher: "Accepted by Dispatcher",
  linked_to_dispatch: "Linked to Dispatch",
  pending_admin_verification: "Pending Admin Verification",
  returned_to_field_officer: "Returned to Field Officer",
  returned_for_correction: "Returned for Correction",
};

function titleCaseStatus(value = "") {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`)
    .join(" ");
}

function priorityLabel(priority = "medium") {
  return `${priority[0]?.toUpperCase() || "M"}${priority.slice(1) || "edium"}`;
}

function severityFromPriority(priority = "medium") {
  if (priority === "critical") return "critical";
  if (priority === "high") return "warning";
  return "moderate";
}

function typeFromClassification(classification = "other") {
  if (classification === "mvc") return "vehicular";
  if (["medical", "trauma", "fire", "rescue"].includes(classification)) return classification;
  return "other";
}

function mapIncident(row = {}) {
  const classification = row.classification || "other";
  const priority = row.priority || "medium";
  return {
    id: row.id,
    responseId: row.response_id || null,
    barangay: row.barangay || "",
    classification,
    subtype: row.subtype || "",
    priority: priorityLabel(priority),
    type: typeFromClassification(classification),
    severity: severityFromPriority(priority),
    title: row.title || "",
    date: row.incident_date || "",
    time: row.incident_time || "",
    location: row.location_text || row.barangay || "",
    lat: row.latitude ?? null,
    lng: row.longitude ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    status: row.status || "draft",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function mapDispatch(row = {}) {
  return {
    id: row.id,
    dispatchId: row.id,
    responseId: row.response_id || null,
    responseNumber: row.response_number || "",
    barangay: row.barangay || "",
    dateOfIncident: row.date_of_incident || "",
    timeOfIncident: row.time_of_incident || "",
    dispatchedTime: row.dispatch_time || "",
    arrivalScene: row.arrival_scene_time || "",
    departureScene: row.departure_scene_time || "",
    arrivalHospital: row.arrival_hospital_time || "",
    departureHospital: row.departure_hospital_time || "",
    backToBase: row.arrival_office_time || "",
    team: row.responding_team || "",
    respondingTeam: row.responding_team || "",
    status: DISPATCH_STATUS_FROM_DB[row.status] || titleCaseStatus(row.status || "draft"),
    sentAt: row.sent_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function mapPcrReport(row = {}) {
  return {
    id: row.id,
    pcrId: row.id,
    responseId: row.response_id || null,
    dispatchId: row.dispatch_form_id || null,
    responseNumber: row.response_number || "",
    barangay: row.barangay || "",
    dateOfIncident: row.date_of_incident || "",
    timeOfIncident: row.time_of_incident || "",
    placeOfIncident: row.place_of_incident || row.location_text || row.barangay || "",
    locationText: row.location_text || row.place_of_incident || row.barangay || "",
    lat: row.latitude ?? null,
    lng: row.longitude ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    respondingTeam: row.responding_team || "",
    team: row.responding_team || "",
    status: PCR_STATUS_FROM_DB[row.status] || titleCaseStatus(row.status || "draft"),
    triage: row.triage || "",
    incidentNature: row.incident_nature || "",
    hospitalName: row.hospital_name || "",
    endorsedTo: row.endorsed_to || "",
    receivedBy: row.received_by || "",
    emergencyTypes: row.emergency_types || [],
    traumaTypes: row.trauma_types || [],
    crash: row.crash || {},
    completedAt: row.completed_at || "",
    submittedAt: row.submitted_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

export async function getStaffAllRecordsAnalytics() {
  const payload = await runSupabaseRequest(
    client => client.rpc("staff_all_records_analytics"),
    "Unable to load all-record analytics.",
  );

  return {
    incidents: (payload?.incidents || []).map(mapIncident),
    dispatches: (payload?.dispatches || []).map(mapDispatch),
    pcrReports: (payload?.pcrReports || []).map(mapPcrReport),
  };
}
