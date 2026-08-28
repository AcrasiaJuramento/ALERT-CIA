import { isSupabaseConfigured } from "../lib/supabaseClient";

const CLOUD_TIMEOUT_MS = 3000;

async function fetchWithTimeout(url, options = {}, timeoutMs = CLOUD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
    return response.ok;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkCloudHealth() {
  const env = import.meta.env;
  if (!isSupabaseConfigured || !env.VITE_SUPABASE_URL) return false;

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  const strictHealth = String(env.VITE_STRICT_SUPABASE_HEALTH || "").toLowerCase() === "true";
  const allowRestFallback = String(env.VITE_SUPABASE_REST_HEALTH_FALLBACK || "").toLowerCase() === "true";
  const primaryHealthUrl = env.VITE_SUPABASE_HEALTH_URL || null;
  const urls = strictHealth
    ? [primaryHealthUrl || `${supabaseUrl}/auth/v1/health`]
    : [
      primaryHealthUrl,
      `${supabaseUrl}/auth/v1/health`,
      allowRestFallback ? `${supabaseUrl}/rest/v1/` : null,
    ].filter(Boolean);

  for (const url of urls) {
    try {
      const isFunctionHealth = url.includes("/functions/v1/");
      const ok = await fetchWithTimeout(url, {
        method: "GET",
        headers: !isFunctionHealth && publishableKey ? { apikey: publishableKey } : undefined,
      }, CLOUD_TIMEOUT_MS);
      if (ok) return true;
    } catch {
      // Try the next cloud health signal before declaring cloud offline.
    }
  }
  return false;
}
