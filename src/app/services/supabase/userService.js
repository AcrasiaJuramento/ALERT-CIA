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
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role)")
      .eq("id", authData.user.id)
      .maybeSingle();
  }, "Unable to load current profile.");
}

export async function listProfiles() {
  return runSupabaseRequest(client =>
    client
      .from("profiles")
      .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name)")
      .is("deleted_at", null)
      .order("display_name", { ascending: true }),
  "Unable to load users.");
}

export async function upsertProfile(profile) {
  return runSupabaseRequest(client =>
    client.from("profiles").upsert(profile).select("*").single(),
  "Unable to save user profile.");
}

export async function assignProfileRole(profileId, role) {
  if (role === "administrator") {
    throw new Error("Administrator roles must be assigned through a controlled admin-only setup.");
  }

  return runSupabaseRequest(client =>
    client.from("profile_roles").upsert({ profile_id: profileId, role }).select("*").single(),
  "Unable to assign user role.");
}

export async function deactivateProfile(profileId) {
  return runSupabaseRequest(client =>
    client
      .from("profiles")
      .update({ account_status: "inactive", deleted_at: new Date().toISOString() })
      .eq("id", profileId)
      .select("*")
      .single(),
  "Unable to deactivate user.");
}
