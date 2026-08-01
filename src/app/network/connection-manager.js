import { CONNECTION_MODES } from "../types/hybrid";
import { checkCloudHealth, checkLocalHealth } from "./health-checks";

const CLOUD_CHECK_INTERVAL_MS = 30000;
const FALLBACK_CHECK_INTERVAL_MS = 15000;
const CONNECTION_TICK_MS = 5000;
const CLOUD_RETRY_ATTEMPTS = 3;
const CLOUD_RETRY_DELAY_MS = 700;
const subscribers = new Set();

let state = {
  mode: CONNECTION_MODES.OFFLINE,
  cloudOnline: false,
  localOnline: false,
  checking: false,
  lastCheckedAt: null,
  lastCloudOnlineAt: null,
  lastLocalOnlineAt: null,
  error: null,
};

let inflight = null;

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function emit() {
  for (const subscriber of subscribers) subscriber(state);
}

function modeFromHealth(cloudOnline, localOnline) {
  if (cloudOnline) return CONNECTION_MODES.CLOUD;
  if (localOnline) return CONNECTION_MODES.LOCAL;
  return CONNECTION_MODES.OFFLINE;
}

function checkIntervalForMode(mode) {
  return mode === CONNECTION_MODES.CLOUD ? CLOUD_CHECK_INTERVAL_MS : FALLBACK_CHECK_INTERVAL_MS;
}

async function checkCloudWithRetries() {
  for (let attempt = 1; attempt <= CLOUD_RETRY_ATTEMPTS; attempt += 1) {
    if (await checkCloudHealth()) return true;
    if (attempt < CLOUD_RETRY_ATTEMPTS) await sleep(CLOUD_RETRY_DELAY_MS);
  }
  return false;
}

export function getConnectionState() {
  return state;
}

export function subscribeConnection(listener) {
  subscribers.add(listener);
  listener(state);
  return () => subscribers.delete(listener);
}

export async function checkConnection({ force = false } = {}) {
  const now = Date.now();
  if (!force && state.lastCheckedAt && now - Date.parse(state.lastCheckedAt) < checkIntervalForMode(state.mode)) {
    return state;
  }
  if (inflight) return inflight;

  state = { ...state, checking: true, error: null };
  emit();
  inflight = (async () => {
    const cloudOnline = await checkCloudWithRetries();
    const localOnline = await checkLocalHealth();
    const checkedAt = new Date().toISOString();
    state = {
      ...state,
      cloudOnline,
      localOnline,
      mode: modeFromHealth(cloudOnline, localOnline),
      checking: false,
      lastCheckedAt: checkedAt,
      lastCloudOnlineAt: cloudOnline ? checkedAt : state.lastCloudOnlineAt,
      lastLocalOnlineAt: localOnline ? checkedAt : state.lastLocalOnlineAt,
    };
    emit();
    return state;
  })()
    .catch(error => {
      const checkedAt = new Date().toISOString();
      state = {
        ...state,
        cloudOnline: false,
        localOnline: false,
        mode: CONNECTION_MODES.OFFLINE,
        checking: false,
        lastCheckedAt: checkedAt,
        error: error.message || "Connection check failed.",
      };
      emit();
      return state;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function startConnectionManager() {
  checkConnection({ force: true });
  const onFocus = () => checkConnection({ force: true });
  const onOnline = () => checkConnection({ force: true });
  const onOffline = () => checkConnection({ force: true });
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") checkConnection({ force: true });
  };
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibilityChange);
  const interval = window.setInterval(() => checkConnection(), CONNECTION_TICK_MS);
  return () => {
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.clearInterval(interval);
  };
}
