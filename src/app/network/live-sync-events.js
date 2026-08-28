import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";

const listeners = new Set();
let cloudChannel;
let started = false;

function emit(event) {
  for (const listener of listeners) listener(event);
}

function startCloudEvents() {
  if (!isSupabaseConfigured || !supabase || cloudChannel) return;
  cloudChannel = supabase
    .channel("alert-cia-live-sync-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_forms" }, payload => emit({ source: "cloud", type: "dispatch_changed", detail: payload }))
    .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, payload => emit({ source: "cloud", type: "response_changed", detail: payload }))
    .on("postgres_changes", { event: "*", schema: "public", table: "pcr_reports" }, payload => emit({ source: "cloud", type: "pcr_changed", detail: payload }))
    .subscribe();
}

function start() {
  if (started) return;
  started = true;
  startCloudEvents();
}

export function subscribeLiveSyncEvents(listener) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}
