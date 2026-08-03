import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  getLocalServerCandidates,
  getLocalServerConfig,
  localServerConfigFromOrigin,
  localServerUrl,
  saveLocalServerConfig,
} from "../services/device-service";

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

  try {
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
  } catch {
    return false;
  }
}

export async function checkLocalHealth(config) {
  const localConfig = config || await getLocalServerConfig();
  try {
    return await fetchWithTimeout(`${localServerUrl(localConfig)}/health`, { method: "GET" }, localConfig.timeoutMs);
  } catch {
    return false;
  }
}

async function loadAdvertisedConfig(origin, fallbackConfig) {
  const configUrls = [
    `${origin}/alert-cia-local-config.json`,
    `${origin}/.well-known/alert-cia-local.json`,
  ];
  for (const url of configUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), fallbackConfig.timeoutMs);
      const response = await fetch(url, { cache: "no-store", signal: controller.signal })
        .finally(() => clearTimeout(timeout));
      if (!response.ok) continue;
      const data = await response.json();
      const server = data?.server || data;
      if (!server?.host) continue;
      return {
        ...fallbackConfig,
        protocol: server.protocol || fallbackConfig.protocol,
        host: server.host,
        port: String(server.port || fallbackConfig.port),
      };
    } catch {
      // The health endpoint is enough; config files are optional.
    }
  }
  return fallbackConfig;
}

export async function discoverLocalServer() {
  const candidates = await getLocalServerCandidates();
  return new Promise(resolve => {
    let remaining = candidates.length;
    if (!remaining) {
      resolve(null);
      return;
    }
    candidates.forEach(async candidate => {
      try {
        const origin = localServerUrl(candidate);
        if (!await checkLocalHealth(candidate)) return;
        const found = await loadAdvertisedConfig(origin, localServerConfigFromOrigin(origin));
        resolve(saveLocalServerConfig({
          ...found,
          lastSuccessfulConnection: new Date().toISOString(),
        }));
      } finally {
        remaining -= 1;
        if (remaining === 0) resolve(null);
      }
    });
  });
}
