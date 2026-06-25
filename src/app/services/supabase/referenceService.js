import { runSupabaseRequest } from "./errors";
import { normalizeName } from "./mappers";

export const AMBULANCE_STATUSES = ["available", "busy", "unavailable", "maintenance"];

export function getAmbulanceStatus(unit) {
  if (AMBULANCE_STATUSES.includes(unit?.status)) return unit.status;
  return unit?.active ? "available" : "unavailable";
}

export async function listBarangays({ activeOnly = true } = {}) {
  return runSupabaseRequest(client => {
    let query = client.from("barangays").select("*").order("name", { ascending: true });
    if (activeOnly) query = query.eq("active", true);
    return query;
  }, "Unable to load barangays.");
}

export async function findBarangayByName(name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  return runSupabaseRequest(client =>
    client.from("barangays").select("*").eq("normalized_name", normalizedName).maybeSingle(),
  "Unable to find barangay.");
}

export async function listRespondingTeams({ activeOnly = true } = {}) {
  return runSupabaseRequest(client => {
    let query = client.from("responding_teams").select("*").order("name", { ascending: true });
    if (activeOnly) query = query.eq("active", true).is("deleted_at", null);
    return query;
  }, "Unable to load responding teams.");
}

export async function findRespondingTeamByName(name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  const teams = await listRespondingTeams();
  return teams.find(team => normalizeName(team.name) === normalizedName) || null;
}

export async function listAmbulanceUnits({ activeOnly = true } = {}) {
  return runSupabaseRequest(client => {
    let query = client
      .from("ambulance_units")
      .select("*, responding_team:responding_teams(id, name)")
      .order("call_sign", { ascending: true });
    if (activeOnly) query = query.eq("status", "available");
    return query;
  }, "Unable to load ambulance units.");
}

export async function createAmbulanceUnit({ callSign, plateNumber, description, status = "available", respondingTeamId = null }) {
  return runSupabaseRequest(client =>
    client
      .from("ambulance_units")
      .insert({
        call_sign: callSign,
        plate_number: plateNumber || null,
        description: description || null,
        status,
        active: status === "available",
        responding_team_id: respondingTeamId || null,
      })
      .select("*, responding_team:responding_teams(id, name)")
      .single(),
  "Unable to register ambulance unit.");
}

export async function updateAmbulanceUnitAvailability(unitId, status) {
  const normalizedStatus = AMBULANCE_STATUSES.includes(status) ? status : "unavailable";
  return runSupabaseRequest(client =>
    client
      .from("ambulance_units")
      .update({
        status: normalizedStatus,
        active: normalizedStatus === "available",
        updated_at: new Date().toISOString(),
      })
      .eq("id", unitId)
      .select("*, responding_team:responding_teams(id, name)")
      .single(),
  "Unable to update ambulance availability.");
}

export async function findAmbulanceUnitByCallSign(callSign) {
  const normalizedCallSign = normalizeName(callSign);
  if (!normalizedCallSign) return null;

  const units = await listAmbulanceUnits();
  return units.find(unit => normalizeName(unit.call_sign) === normalizedCallSign) || null;
}

export async function listTeamMembers(teamId) {
  return runSupabaseRequest(client =>
    client
      .from("team_members")
      .select("*, profile:profiles(id, display_name, email, contact_number, position_title)")
      .eq("team_id", teamId)
      .is("left_at", null)
      .order("is_leader", { ascending: false }),
  "Unable to load team members.");
}
