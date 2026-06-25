import { runSupabaseRequest } from "./errors";
import {
  dispatchPayloadFromForm,
  dispatchToApp,
  responsePayloadFromDispatch,
  toDbDispatchStatus,
} from "./mappers";
import { findAmbulanceUnitByCallSign, findBarangayByName, findRespondingTeamByName } from "./referenceService";

const DISPATCH_SELECT = `
  *,
  response:responses(
    *,
    barangay:barangays(id, name, normalized_name),
    responding_team:responding_teams(id, name),
    assigned_unit:ambulance_units(id, call_sign, plate_number)
  ),
  dispatch_patients(*)
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

async function replaceDispatchPatients(client, dispatchFormId, patients = []) {
  await client.from("dispatch_patients").delete().eq("dispatch_form_id", dispatchFormId);
  if (!patients.length) return;

  const payload = patients.map((patient, index) => ({
    dispatch_form_id: dispatchFormId,
    patient_order: index + 1,
    patient_name: patient.name || null,
    age: patient.age ? Number(patient.age) : null,
    birthday: patient.birthdate || null,
    sex: patient.gender || null,
    address: patient.address || null,
    assessment_findings: patient.assessmentFindings || null,
  }));

  const { error } = await client.from("dispatch_patients").insert(payload);
  if (error) throw error;
}

export async function listDispatchRecords({ status, teamId, limit = 100, from = 0 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("dispatch_forms")
      .select(DISPATCH_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (status) query = query.eq("status", toDbDispatchStatus(status));
    if (teamId) query = query.eq("response.responding_team_id", teamId);
    return query;
  }, "Unable to load dispatch records.");

  return rows.map(dispatchToApp);
}

export async function getDispatchRecord(dispatchId) {
  const row = await runSupabaseRequest(client =>
    client.from("dispatch_forms").select(DISPATCH_SELECT).eq("id", dispatchId).maybeSingle(),
  "Unable to load dispatch record.");

  return row ? dispatchToApp(row) : null;
}

export async function createDispatchRecord(form) {
  const ids = await resolveDispatchIds(form);

  return runSupabaseRequest(async client => {
    const { data: response, error: responseError } = await client
      .from("responses")
      .insert(responsePayloadFromDispatch(form, ids))
      .select("*")
      .single();
    if (responseError) return { data: null, error: responseError };

    const { data: dispatch, error: dispatchError } = await client
      .from("dispatch_forms")
      .insert({ ...dispatchPayloadFromForm(form), response_id: response.id })
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
  const ids = await resolveDispatchIds(form);
  const existing = await getDispatchRecord(dispatchId);
  if (!existing) throw new Error("Dispatch record was not found.");

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
