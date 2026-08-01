import { getSupabaseClient } from "../../lib/supabaseClient";

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
