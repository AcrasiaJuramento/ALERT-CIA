import { getSupabaseClient } from "../../lib/supabaseClient";

const inflightRequests = new Map();
const responseCache = new Map();

function cloneCachedData(value) {
  if (value === null || value === undefined) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export class SupabaseServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "SupabaseServiceError";
    this.cause = cause;
    this.details = cause?.details;
    this.hint = cause?.hint;
    this.code = cause?.code;
  }
}

export function formatSupabaseError(error, fallback = "Supabase request failed.") {
  if (!error) return fallback;
  const parts = [
    error.message,
    error.details && `Details: ${error.details}`,
    error.hint && `Hint: ${error.hint}`,
    error.code && `Code: ${error.code}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : fallback;
}

export function handleSupabaseError(error, fallback) {
  if (error) throw new SupabaseServiceError(formatSupabaseError(error, fallback), error);
}

export async function runSupabaseRequest(request, fallback) {
  const { data, error } = await request(getSupabaseClient());
  handleSupabaseError(error, fallback);
  return data;
}

export async function runSupabaseRequestWithMeta(request, fallback) {
  const result = await request(getSupabaseClient());
  handleSupabaseError(result.error, fallback);
  return result;
}

export async function runCachedSupabaseRequest(cacheKey, request, fallback, { ttlMs = 60000, force = false } = {}) {
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > now) return cloneCachedData(cached.data);
  if (!force && inflightRequests.has(cacheKey)) return cloneCachedData(await inflightRequests.get(cacheKey));

  const promise = runSupabaseRequest(request, fallback)
    .then(data => {
      responseCache.set(cacheKey, { data: cloneCachedData(data), expiresAt: Date.now() + ttlMs });
      return data;
    })
    .finally(() => inflightRequests.delete(cacheKey));

  inflightRequests.set(cacheKey, promise);
  return cloneCachedData(await promise);
}

export function clearSupabaseRequestCache(prefix = "") {
  for (const key of responseCache.keys()) {
    if (!prefix || key.startsWith(prefix)) responseCache.delete(key);
  }
}
