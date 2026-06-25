import { runSupabaseRequest } from "./errors";

export async function getCachedPayload(cacheKey) {
  const row = await runSupabaseRequest(client =>
    client.from("app_cache").select("*").eq("cache_key", cacheKey).gt("expires_at", new Date().toISOString()).maybeSingle(),
  "Unable to load cached data.");

  return row?.payload ?? null;
}

export async function setCachedPayload(cacheKey, scope, payload, ttlMs = 5 * 60 * 1000) {
  return runSupabaseRequest(client =>
    client.from("app_cache").upsert({
      cache_key: cacheKey,
      scope,
      payload,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      refreshed_at: new Date().toISOString(),
    }).select("*").single(),
  "Unable to save cached data.");
}

export async function clearCache(scope = null) {
  return runSupabaseRequest(client =>
    client.rpc("clear_app_cache", { target_scope: scope }),
  "Unable to clear cache.");
}

export async function listBarangayIncidentCounts() {
  return runSupabaseRequest(client =>
    client.from("mv_barangay_incident_counts").select("*").order("barangay_name", { ascending: true }),
  "Unable to load barangay incident counts.");
}

export async function refreshBarangayIncidentCounts() {
  return runSupabaseRequest(client =>
    client.rpc("refresh_barangay_incident_counts"),
  "Unable to refresh barangay incident counts.");
}
