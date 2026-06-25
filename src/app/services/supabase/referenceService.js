import { runSupabaseRequest } from "./errors";
import { normalizeName } from "./mappers";

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
    let query = client.from("ambulance_units").select("*").order("call_sign", { ascending: true });
    if (activeOnly) query = query.eq("active", true);
    return query;
  }, "Unable to load ambulance units.");
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
