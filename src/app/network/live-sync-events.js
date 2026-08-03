import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { getLocalServerConfig, localServerUrl } from "../services/device-service";

const listeners = new Set();
let localEvents;
let cloudChannel;
let started = false;

function emit(event) {
  for (const listener of listeners) listener(event);
}

function startLocalEvents() {
  getLocalServerConfig()
    .then(config => {
      const url = `${localServerUrl(config)}/api/events`;
      if (localEvents && localEvents.url === url && localEvents.readyState !== EventSource.CLOSED) return;
      if (localEvents) localEvents.close();
      localEvents = new EventSource(url);
      localEvents.addEventListener("ready", event => emit({ source: "local", type: "ready", detail: event.data }));
      localEvents.addEventListener("dispatch_changed", event => emit({ source: "local", type: "dispatch_changed", detail: JSON.parse(event.data) }));
      localEvents.addEventListener("pcr_changed", event => emit({ source: "local", type: "pcr_changed", detail: JSON.parse(event.data) }));
      localEvents.onerror = () => {
        emit({ source: "local", type: "event_stream_error" });
        localEvents?.close();
        localEvents = null;
      };
    })
    .catch(() => undefined);
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
  startLocalEvents();
  startCloudEvents();
}

export function subscribeLiveSyncEvents(listener) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}
