import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient, getSupabaseUrl, getSupabasePublishableKey } from "./supabase.js";

const AUTHORIZED_ROLES = new Set(["administrator", "dispatcher", "field_responder"]);

export async function requireAuthorizedScraperUser(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { authorized: false, status: 401, message: "Authentication required." };
  }

  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  if (!url || !publishableKey) {
    return { authorized: false, status: 500, message: "Supabase auth is not configured for scraper triggers." };
  }

  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    return { authorized: false, status: 401, message: "Invalid or expired session." };
  }

  const admin = getSupabaseAdminClient();
  const { data: roles, error: roleError } = await admin
    .from("profile_roles")
    .select("role")
    .eq("profile_id", data.user.id);

  if (roleError) {
    return { authorized: false, status: 500, message: roleError.message };
  }

  const roleNames = (roles || []).map((row) => row.role);
  if (!roleNames.some((role) => AUTHORIZED_ROLES.has(role))) {
    return { authorized: false, status: 403, message: "Not authorized to refresh scraper data." };
  }

  return { authorized: true, user: data.user, roles: roleNames };
}
