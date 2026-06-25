import { runSupabaseRequest } from "./errors";
import { findBarangayByName } from "./referenceService";

function incidentToApp(row = {}) {
  return {
    id: row.id,
    responseId: row.response_id || null,
    barangayId: row.barangay_id || null,
    barangay: row.barangay?.name || row.barangays?.name || "",
    classification: row.classification,
    subtype: row.subtype || "",
    priority: row.priority,
    title: row.title || "",
    description: row.description || "",
    date: row.incident_date,
    time: row.incident_time || "",
    location: row.location_text || "",
    publicVisible: row.public_visible,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function incidentPayload(record = {}, barangayId) {
  return {
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
}

export async function listIncidents({ publicOnly = false, limit = 200, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("incidents")
      .select("*, barangay:barangays(id, name)")
      .is("deleted_at", null)
      .order("incident_date", { ascending: false })
      .range(from, from + limit - 1);
    if (publicOnly) query = query.eq("public_visible", true);
    return query;
  }, "Unable to load incidents.");

  return rows.map(incidentToApp);
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
