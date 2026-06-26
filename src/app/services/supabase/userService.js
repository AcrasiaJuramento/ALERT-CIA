import { runSupabaseRequest } from "./errors";
import { getSupabaseClient } from "../../lib/supabaseClient";

const PUBLIC_REGISTRATION_ROLES = new Set(["dispatcher", "field_responder"]);

export function getRegistrationErrorMessage(error) {
  const message = error?.message || "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("weak password") ||
    normalized.includes("password is too weak") ||
    normalized.includes("password has been leaked") ||
    normalized.includes("password has been found") ||
    normalized.includes("compromised")
  ) {
    return "This password is unsafe or has appeared in a known data breach. Please choose a stronger, unique password.";
  }

  return message || "Unable to submit registration request.";
}

export function assertPublicRegistrationRole(role) {
  if (!PUBLIC_REGISTRATION_ROLES.has(role)) {
    throw new Error("Public registration is only available for Dispatcher and Field Officer accounts.");
  }
}

export async function registerOfficerAccount({
  name,
  email,
  password,
  contact,
  position,
  agency,
  role,
}) {
  assertPublicRegistrationRole(role);

  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: name,
        name,
        contact_number: contact,
        position_title: position,
        agency,
        role,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function getCurrentUserProfile() {
  return runSupabaseRequest(async client => {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) return { data: null, error: authError };
    if (!authData.user) return { data: null, error: null };

    return client
      .from("profiles")
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
      .eq("id", authData.user.id)
      .maybeSingle();
  }, "Unable to load current profile.");
}

export async function listProfiles() {
  return runSupabaseRequest(client =>
    client
      .from("profiles")
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
      .is("deleted_at", null)
      .order("display_name", { ascending: true }),
  "Unable to load users.");
}

export async function getProfile(profileId) {
  return runSupabaseRequest(client =>
    client
      .from("profiles")
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
      .eq("id", profileId)
      .single(),
  "Unable to load user profile.");
}

export async function upsertProfile(profile) {
  return runSupabaseRequest(client =>
    client.from("profiles").upsert(profile).select("*").single(),
  "Unable to save user profile.");
}

export async function updateProfile(profileId, updates) {
  return runSupabaseRequest(client =>
    client
      .from("profiles")
      .update(updates)
      .eq("id", profileId)
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
      .single(),
  "Unable to save user profile.");
}

export async function assignProfileRole(profileId, role) {
  if (role === "administrator") {
    throw new Error("Administrator roles must be assigned through a controlled admin-only setup.");
  }

  return runSupabaseRequest(async client => {
    const { error: deleteError } = await client
      .from("profile_roles")
      .delete()
      .eq("profile_id", profileId);

    if (deleteError) return { data: null, error: deleteError };

    const { error: insertError } = await client
      .from("profile_roles")
      .insert({ profile_id: profileId, role });

    if (insertError) return { data: null, error: insertError };

    if (role !== "field_responder") {
      const { error: membershipError } = await client
        .from("team_members")
        .update({ left_at: new Date().toISOString() })
        .eq("profile_id", profileId)
        .is("left_at", null);

      if (membershipError) return { data: null, error: membershipError };
    }

    return client
      .from("profiles")
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
      .eq("id", profileId)
      .single();
  }, "Unable to assign user role.");
}

export function getActiveTeamMembership(profile = {}) {
  return (profile.team_members || []).find(membership => !membership.left_at) || null;
}

export async function getCurrentProfileTeamMemberships() {
  return runSupabaseRequest(async client => {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) return { data: null, error: authError };
    if (!authData.user) return { data: [], error: null };

    return client
      .from("team_members")
      .select("id, team_id, team_role, is_leader, joined_at, left_at, team:responding_teams(id, name)")
      .eq("profile_id", authData.user.id)
      .is("left_at", null);
  }, "Unable to load your responding team assignment.");
}

export async function assignProfileToRespondingTeam(profileId, teamId, { teamRole = "Field Officer", isLeader = false } = {}) {
  return runSupabaseRequest(async client => {
    const leftAt = new Date().toISOString();
    const { error: closeError } = await client
      .from("team_members")
      .update({ left_at: leftAt })
      .eq("profile_id", profileId)
      .is("left_at", null);

    if (closeError) return { data: null, error: closeError };

    if (teamId) {
      const { error: insertError } = await client
        .from("team_members")
        .insert({
          profile_id: profileId,
          team_id: teamId,
          team_role: teamRole || "Field Officer",
          is_leader: Boolean(isLeader),
        });

      if (insertError) return { data: null, error: insertError };
    }

    return client
      .from("profiles")
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
      .eq("id", profileId)
      .single();
  }, "Unable to update responding team assignment.");
}

export async function deactivateProfile(profileId) {
  return runSupabaseRequest(client =>
    client
      .from("profiles")
      .update({ account_status: "inactive", deleted_at: new Date().toISOString() })
      .eq("id", profileId)
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
      .single(),
  "Unable to deactivate user.");
}
