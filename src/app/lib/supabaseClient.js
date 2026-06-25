import { createClient } from "@supabase/supabase-js";

console.log('Supabase URL loaded:', !!import.meta.env.VITE_SUPABASE_URL);
console.log('Supabase publishable key loaded:', !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        headers: {
          "x-client-info": "alert-cia-web",
        },
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your environment.");
  }

  return supabase;
}
