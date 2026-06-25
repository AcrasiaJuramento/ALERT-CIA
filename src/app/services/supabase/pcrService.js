import { runSupabaseRequest } from "./errors";
import { pcrPayloadFromRecord, pcrToApp, toDbPCRStatus } from "./mappers";

const PCR_SELECT = `
  *,
  response:responses(
    *,
    barangay:barangays(id, name, normalized_name),
    responding_team:responding_teams(id, name),
    assigned_unit:ambulance_units(id, call_sign, plate_number)
  ),
  pcr_vital_signs(*),
  pcr_medications(*),
  pcr_interventions(*),
  pcr_attachments(*)
`;

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

  return rows.map(pcrToApp);
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
  return runSupabaseRequest(client =>
    client
      .from("pcr_reports")
      .update(pcrPayloadFromRecord(record))
      .eq("id", pcrId)
      .select(PCR_SELECT)
      .single(),
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
