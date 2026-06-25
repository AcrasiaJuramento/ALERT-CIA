import { runSupabaseRequest } from "./errors";

export async function getCurrentUserProfile() {
  return runSupabaseRequest(async client => {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) return { data: null, error: authError };
    if (!authData.user) return { data: null, error: null };

    return client
      .from("profiles")
      .select("*, roles:profile_roles(role)")
      .eq("id", authData.user.id)
      .maybeSingle();
  }, "Unable to load current profile.");
}

export async function listProfiles() {
  return runSupabaseRequest(client =>
    client
      .from("profiles")
      .select("*, roles:profile_roles(role), station:stations(id, name)")
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
