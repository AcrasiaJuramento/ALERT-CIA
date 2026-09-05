import { clearSupabaseRequestCache, runCachedSupabaseRequest, runSupabaseRequest } from "./errors";
import { normalizeName } from "./mappers";

export const AMBULANCE_STATUSES = ["available", "busy", "unavailable", "maintenance"];

export function getAmbulanceStatus(unit) {
  if (AMBULANCE_STATUSES.includes(unit?.status)) return unit.status;
  return unit?.active ? "available" : "unavailable";
}

const BARANGAY_TTL_MS = 24 * 60 * 60 * 1000;
const REFERENCE_TTL_MS = 10 * 60 * 1000;
const LIVE_REFERENCE_TTL_MS = 30 * 1000;
const BARANGAY_SELECT = "id, psgc_code, name, normalized_name, municipality, province, active, centroid";
const TEAM_SELECT = "id, name, status, active, station_id, created_at, updated_at, deleted_at";
const AMBULANCE_SELECT = "id, call_sign, plate_number, description, status, active, responding_team_id, updated_at, responding_team:responding_teams(id, name)";
const CREW_SELECT = "id, name, role, contact_number, responding_team_id, active, updated_at";

export async function listBarangays({ activeOnly = true, municipality = "" } = {}) {
  const municipalitySearch = String(municipality || "")
    .replace(/\b(?:city|municipality)\b/gi, "")
    .replace(/[,%]/g, " ")
    .trim();
  return runCachedSupabaseRequest(`reference:barangays:${activeOnly}:${municipalitySearch.toLowerCase()}`, client => {
    let query = client.from("barangays").select(BARANGAY_SELECT).order("name", { ascending: true });
    if (activeOnly) query = query.eq("active", true);
    if (municipalitySearch) query = query.ilike("municipality", `%${municipalitySearch}%`);
    return query;
  }, "Unable to load barangays.", { ttlMs: BARANGAY_TTL_MS });
}

export async function findBarangayByName(name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  const rows = await listBarangays({ activeOnly: false });
  return rows.find(barangay => barangay.normalized_name === normalizedName) || null;
}

export async function listRespondingTeams({ activeOnly = true } = {}) {
  return runCachedSupabaseRequest(`reference:responding_teams:${activeOnly}`, client => {
    let query = client.from("responding_teams").select(TEAM_SELECT).order("name", { ascending: true });
    if (activeOnly) query = query.eq("active", true).is("deleted_at", null);
    return query;
  }, "Unable to load responding teams.", { ttlMs: REFERENCE_TTL_MS });
}

export async function createRespondingTeam({ name }) {
  const teamName = String(name || "").trim();
  if (!teamName) throw new Error("Responding team name is required.");

  const saved = await runSupabaseRequest(async client => {
    const { data: existingTeams, error: findError } = await client
      .from("responding_teams")
      .select(TEAM_SELECT);

    if (findError) return { data: null, error: findError };

    const normalizedTeamName = normalizeName(teamName);
    const inactiveMatch = (existingTeams || []).find(team => normalizeName(team.name) === normalizedTeamName);

    if (inactiveMatch?.deleted_at || inactiveMatch?.active === false) {
      return client
        .from("responding_teams")
        .update({
          name: teamName,
          status: "available",
          active: true,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inactiveMatch.id)
        .select(TEAM_SELECT)
        .single();
    }

    if (inactiveMatch) {
      return {
        data: null,
        error: new Error("A responding team with this name already exists."),
      };
    }

    return client
      .from("responding_teams")
      .insert({ name: teamName, status: "available", active: true })
      .select(TEAM_SELECT)
      .single();
  }, "Unable to create responding team.");

  clearSupabaseRequestCache("reference:responding_teams");
  return saved;
}

export async function deleteRespondingTeam(teamId) {
  const deletedAt = new Date().toISOString();
  const saved = await runSupabaseRequest(async client => {
    const { error: memberError } = await client
      .from("team_members")
      .update({ left_at: deletedAt })
      .eq("team_id", teamId)
      .is("left_at", null);

    if (memberError) return { data: null, error: memberError };

    const { error: crewError } = await client
      .from("crew_members")
      .update({ responding_team_id: null, updated_at: deletedAt })
      .eq("responding_team_id", teamId);

    if (crewError) return { data: null, error: crewError };

    return client
      .from("responding_teams")
      .update({
        status: "off_duty",
        active: false,
        deleted_at: deletedAt,
        updated_at: deletedAt,
      })
      .eq("id", teamId)
      .select(TEAM_SELECT)
      .single();
  }, "Unable to delete responding team.");

  clearSupabaseRequestCache("reference:responding_teams");
  clearSupabaseRequestCache("reference:crew_members");
  return saved;
}

export async function findRespondingTeamByName(name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  const teams = await listRespondingTeams();
  return teams.find(team => normalizeName(team.name) === normalizedName) || null;
}

export async function listAmbulanceUnits({ activeOnly = true } = {}) {
  return runCachedSupabaseRequest(`reference:ambulance_units:${activeOnly}`, client => {
    let query = client
      .from("ambulance_units")
      .select(AMBULANCE_SELECT)
      .order("call_sign", { ascending: true });
    if (activeOnly) query = query.eq("status", "available");
    return query;
  }, "Unable to load ambulance units.", { ttlMs: LIVE_REFERENCE_TTL_MS });
}

export async function listCrewMembers({ activeOnly = true, role } = {}) {
  return runCachedSupabaseRequest(`reference:crew_members:${activeOnly}:${role || "all"}`, client => {
    let query = client
      .from("crew_members")
      .select(CREW_SELECT)
      .order("role", { ascending: true })
      .order("name", { ascending: true });
    if (activeOnly) query = query.eq("active", true);
    if (role) query = query.eq("role", role);
    return query;
  }, "Unable to load crew roster.", { ttlMs: REFERENCE_TTL_MS });
}

export async function createCrewMember({ name, role, contactNumber = "", respondingTeamId = null, active = true }) {
  const saved = await runSupabaseRequest(client =>
    client
      .from("crew_members")
      .insert({
        name,
        role,
        contact_number: contactNumber || null,
        responding_team_id: respondingTeamId || null,
        active,
      })
      .select(CREW_SELECT)
      .single(),
  "Unable to add crew member.");
  clearSupabaseRequestCache("reference:crew_members");
  return saved;
}

export async function updateCrewMember(crewMemberId, updates) {
  const saved = await runSupabaseRequest(client =>
    client
      .from("crew_members")
      .update({
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.role !== undefined ? { role: updates.role } : {}),
        ...(updates.contactNumber !== undefined ? { contact_number: updates.contactNumber || null } : {}),
        ...(updates.respondingTeamId !== undefined ? { responding_team_id: updates.respondingTeamId || null } : {}),
        ...(updates.active !== undefined ? { active: updates.active } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", crewMemberId)
      .select(CREW_SELECT)
      .single(),
  "Unable to update crew member.");
  clearSupabaseRequestCache("reference:crew_members");
  return saved;
}

export async function createAmbulanceUnit({ callSign, plateNumber, description, status = "available", respondingTeamId = null }) {
  const saved = await runSupabaseRequest(client =>
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
      .select(AMBULANCE_SELECT)
      .single(),
  "Unable to register ambulance unit.");
  clearSupabaseRequestCache("reference:ambulance_units");
  return saved;
}

export async function updateAmbulanceUnitAvailability(unitId, status) {
  const normalizedStatus = AMBULANCE_STATUSES.includes(status) ? status : "unavailable";
  const saved = await runSupabaseRequest(client =>
    client
      .from("ambulance_units")
      .update({
        status: normalizedStatus,
        active: normalizedStatus === "available",
        updated_at: new Date().toISOString(),
      })
      .eq("id", unitId)
      .select(AMBULANCE_SELECT)
      .single(),
  "Unable to update ambulance availability.");
  clearSupabaseRequestCache("reference:ambulance_units");
  return saved;
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
