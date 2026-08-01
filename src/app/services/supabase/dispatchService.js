import { runSupabaseRequest } from "./errors";
import {
  dispatchPayloadFromForm,
  dispatchToApp,
  isValidIncidentCoordinate,
  patientBirthdayFromRecord,
  responsePayloadFromDispatch,
  toDbDispatchStatus,
} from "./mappers";
import { findAmbulanceUnitByCallSign, findBarangayByName, findRespondingTeamByName } from "./referenceService";
import { getCurrentProfileTeamMemberships } from "./userService";

const DISPATCH_SELECT = `
  *,
  response:responses(
    *,
    barangay:barangays(id, name, normalized_name, centroid),
    responding_team:responding_teams!responses_responding_team_id_fkey(id, name),
    assigned_unit:ambulance_units(id, call_sign, plate_number)
  ),
  dispatch_patients(*)
`;

const DISPATCH_LIST_SELECT = `
  id,
  client_generated_id,
  response_id,
  dispatch_time,
  arrival_scene_time,
  departure_scene_time,
  arrival_hospital_time,
  departure_hospital_time,
  arrival_office_time,
  hospital_name,
  number_of_patients,
  assistance_needed,
  notes,
  status,
  sent_at,
  created_at,
  updated_at,
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
    caller_name,
    caller_contact,
    caller_address,
    responding_team_id,
    assigned_unit_id,
    status,
    barangay:barangays(id, name, normalized_name),
    responding_team:responding_teams!responses_responding_team_id_fkey(id, name),
    assigned_unit:ambulance_units(id, call_sign)
  )
`;

async function resolveDispatchIds(form) {
  const [barangay, team, unit] = await Promise.all([
    form.barangayId ? null : findBarangayByName(form.barangay),
    form.respondingTeamId ? null : findRespondingTeamByName(form.team || form.respondingTeam),
    form.vehicleId ? null : findAmbulanceUnitByCallSign(form.vehicle),
  ]);

  return {
    barangayId: form.barangayId || barangay?.id || null,
    teamId: form.respondingTeamId || team?.id || null,
    unitId: form.vehicleId || unit?.id || null,
  };
}

function ensurePinnedLocation(form) {
  if (!isValidIncidentCoordinate(form.latitude, form.longitude)) {
    throw new Error("Please pin the exact incident location inside Echague before saving this report.");
  }
}

async function replaceDispatchPatients(client, dispatchFormId, patients = []) {
  await client.from("dispatch_patients").delete().eq("dispatch_form_id", dispatchFormId);
  if (!patients.length) return;

  const payload = patients.map((patient, index) => ({
    id: patient.id || patient.dispatchPatientId || patient.patientClientId || undefined,
    dispatch_form_id: dispatchFormId,
    client_generated_id: patient.patientClientId || patient.id || patient.dispatchPatientId || null,
    patient_order: index + 1,
    patient_name: patient.name || null,
    age: patient.age ? Number(patient.age) : null,
    birthday: patientBirthdayFromRecord(patient),
    sex: patient.gender || null,
    address: patient.address || null,
    assessment_findings: patient.assessmentFindings || null,
  }));

  const { error } = await client.from("dispatch_patients").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function listDispatchRecords({ status, teamId, limit = 100, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("dispatch_forms")
      .select(DISPATCH_LIST_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (status) query = query.eq("status", toDbDispatchStatus(status));
    return query;
  }, "Unable to load dispatch records.");

  const mappedRows = rows.map(dispatchToApp);
  return teamId ? mappedRows.filter(row => row.respondingTeamId === teamId) : mappedRows;
}

export async function listReceivedDispatchRecords({ limit = 100, from = 0 } = {}) {
  const memberships = await getCurrentProfileTeamMemberships();
  const teamIds = memberships.map(membership => membership.team_id).filter(Boolean);
  if (!teamIds.length) return [];

  const rows = await listDispatchRecords({ limit, from });
  return rows.filter(row => teamIds.includes(row.respondingTeamId));
}

export async function getDispatchRecord(dispatchId) {
  const row = await runSupabaseRequest(client =>
    client.from("dispatch_forms").select(DISPATCH_SELECT).eq("id", dispatchId).maybeSingle(),
  "Unable to load dispatch record.");

  return row ? dispatchToApp(row) : null;
}

export async function createDispatchRecord(form) {
  ensurePinnedLocation(form);
  const ids = await resolveDispatchIds(form);
  if (!ids.teamId && !form.respondingTeamId) {
    throw new Error("A responding team is required before saving this dispatch.");
  }

  return runSupabaseRequest(async client => {
    const responsePayload = responsePayloadFromDispatch(form, ids);
    if (form.responseId) responsePayload.id = form.responseId;

    const { data: response, error: responseError } = await client
      .from("responses")
      .upsert(responsePayload, { onConflict: "id" })
      .select("*")
      .single();
    if (responseError) return { data: null, error: responseError };

    const dispatchPayload = { ...dispatchPayloadFromForm(form), response_id: response.id };
    const dispatchId = form.dispatchId || form.id;
    if (dispatchId) dispatchPayload.id = dispatchId;

    const { data: dispatch, error: dispatchError } = await client
      .from("dispatch_forms")
      .upsert(dispatchPayload, { onConflict: "id" })
      .select("*")
      .single();
    if (dispatchError) return { data: null, error: dispatchError };

    try {
      await replaceDispatchPatients(client, dispatch.id, form.patients || []);
    } catch (error) {
      return { data: null, error };
    }

    return client.from("dispatch_forms").select(DISPATCH_SELECT).eq("id", dispatch.id).single();
  }, "Unable to create dispatch record.").then(dispatchToApp);
}

export async function updateDispatchRecord(dispatchId, form) {
  ensurePinnedLocation(form);
  const ids = await resolveDispatchIds(form);
  if (!ids.teamId && !form.respondingTeamId) {
    throw new Error("A responding team is required before saving this dispatch.");
  }
  const existing = await getDispatchRecord(dispatchId);
  if (!existing) {
    return createDispatchRecord({ ...form, id: dispatchId, dispatchId: form.dispatchId || dispatchId });
  }

  return runSupabaseRequest(async client => {
    const { error: responseError } = await client
      .from("responses")
      .update(responsePayloadFromDispatch(form, ids))
      .eq("id", existing.responseId);
    if (responseError) return { data: null, error: responseError };

    const { error: dispatchError } = await client
      .from("dispatch_forms")
      .update(dispatchPayloadFromForm(form))
      .eq("id", dispatchId);
    if (dispatchError) return { data: null, error: dispatchError };

    try {
      await replaceDispatchPatients(client, dispatchId, form.patients || []);
    } catch (error) {
      return { data: null, error };
    }

    return client.from("dispatch_forms").select(DISPATCH_SELECT).eq("id", dispatchId).single();
  }, "Unable to update dispatch record.").then(dispatchToApp);
}

export async function sendDispatchToRespondingTeam(dispatchId) {
  return runSupabaseRequest(async client => {
    const { data: currentDispatch, error: currentError } = await client
      .from("dispatch_forms")
      .select("response:responses(responding_team_id)")
      .eq("id", dispatchId)
      .single();
    if (currentError) return { data: null, error: currentError };
    if (!currentDispatch?.response?.responding_team_id) {
      return { data: null, error: new Error("A responding team is required before sending this dispatch.") };
    }

    const sentAt = new Date().toISOString();
    const { data: dispatch, error: dispatchError } = await client
      .from("dispatch_forms")
      .update({ status: "sent_to_responding_team", sent_at: sentAt })
      .eq("id", dispatchId)
      .select("response_id")
      .single();
    if (dispatchError) return { data: null, error: dispatchError };

    const { error: responseError } = await client
      .from("responses")
      .update({ status: "sent_to_responding_team" })
      .eq("id", dispatch.response_id);
    if (responseError) return { data: null, error: responseError };

    return client.from("dispatch_forms").select(DISPATCH_SELECT).eq("id", dispatchId).single();
  }, "Unable to send dispatch to responding team.").then(dispatchToApp);
}

export async function acceptDispatchByResponse(responseId) {
  return runSupabaseRequest(client =>
    client.rpc("accept_dispatch", { target_response_id: responseId }),
  "Unable to accept dispatch.");
}

export async function markResponseBackToBase(responseId) {
  return runSupabaseRequest(client =>
    client.rpc("mark_response_back_to_base", { target_response_id: responseId }),
  "Unable to mark response as back to base.");
}

export async function archiveDispatchRecord(dispatchId) {
  return runSupabaseRequest(client =>
    client
      .from("dispatch_forms")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", dispatchId)
      .select("*")
      .single(),
  "Unable to archive dispatch record.");
}
