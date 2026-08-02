export const OFFLINE_SETTINGS_KEY = "alert_cia_offline_settings";

const DEFAULT_RETURN_PATH = "/admin";

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function safeReturnPath(pathname, search = "", hash = "") {
  const path = `${pathname || ""}${search || ""}${hash || ""}`;
  if (!path || path === "/offline.html" || !path.startsWith("/") || path.startsWith("//")) return DEFAULT_RETURN_PATH;
  return path;
}

export function readOfflineSettings() {
  if (!canUseLocalStorage()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(OFFLINE_SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function writeOfflineSettings(settings = {}) {
  if (!canUseLocalStorage()) return {};
  const next = {
    ...readOfflineSettings(),
    ...settings,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(OFFLINE_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function rememberCurrentAppLocation() {
  if (typeof window === "undefined") return;
  writeOfflineSettings({
    appOrigin: window.location.origin,
    returnPath: safeReturnPath(window.location.pathname, window.location.search, window.location.hash),
  });
}

export function startOfflineSettingsCapture() {
  if (typeof window === "undefined") return undefined;
  rememberCurrentAppLocation();

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const rememberSoon = () => window.setTimeout(rememberCurrentAppLocation, 0);

  window.history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    rememberSoon();
    return result;
  };
  window.history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    rememberSoon();
    return result;
  };
  window.addEventListener("popstate", rememberCurrentAppLocation);
  window.addEventListener("visibilitychange", rememberCurrentAppLocation);

  return () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", rememberCurrentAppLocation);
    window.removeEventListener("visibilitychange", rememberCurrentAppLocation);
  };
}
