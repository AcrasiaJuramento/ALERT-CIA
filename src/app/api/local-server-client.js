import { getDeviceId, getLocalServerConfig, localServerUrl } from "../services/device-service";

function requestBase(config) {
  if (typeof window !== "undefined" && window.location.port === String(config.port || "4000") && !window.location.hostname.endsWith("vercel.app")) {
    return window.location.origin;
  }
  return localServerUrl(config);
}

async function request(path, { method = "GET", body, timeoutMs } = {}) {
  const config = await getLocalServerConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || config.timeoutMs);
  try {
    const deviceId = await getDeviceId();
    const response = await fetch(`${requestBase(config)}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-ALERT-CIA-Device-ID": deviceId,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.error || `Local server request failed (${response.status}).`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export const localServerClient = {
  health: () => request("/health"),
  login: credentials => request("/api/auth/login", { method: "POST", body: credentials }),
  cacheUser: payload => request("/api/auth/cache-user", { method: "POST", body: payload }),
  createIncident: payload => request("/api/incidents", { method: "POST", body: payload }),
  listDispatches: () => request("/api/dispatches"),
  listReceivedDispatches: () => request("/api/dispatches/received"),
  getDispatch: id => request(`/api/dispatches/${id}`),
  createDispatch: payload => request("/api/dispatches", { method: "POST", body: payload }),
  updateDispatch: (id, payload) => request(`/api/dispatches/${id}`, { method: "PUT", body: payload }),
  sendDispatch: id => request(`/api/dispatches/${id}/send`, { method: "POST" }),
  acceptDispatchByResponse: responseId => request(`/api/responses/${responseId}/accept`, { method: "POST" }),
  markResponseBackToBase: responseId => request(`/api/responses/${responseId}/back-to-base`, { method: "POST" }),
  listPcrReports: () => request("/api/pcr-reports"),
  getPcrByResponse: responseId => request(`/api/responses/${responseId}/pcr`),
  getPcr: id => request(`/api/pcr-reports/${id}`),
  acknowledgeDispatch: id => request(`/api/assignments/${id}/acknowledge`, { method: "POST" }),
  savePcrDraft: payload => request("/api/pcr-reports", { method: "PUT", body: payload }),
  submitPcr: payload => request("/api/pcr-reports/submit", { method: "POST", body: payload }),
  syncOperation: operation => request("/api/sync/operations", { method: "POST", body: operation }),
};
