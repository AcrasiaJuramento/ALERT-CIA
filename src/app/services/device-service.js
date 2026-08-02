import { getDeviceSetting, putDeviceSetting } from "../db/indexed-db";
import { readOfflineSettings, writeOfflineSettings } from "../pwa/offline-settings";
import { randomUuid } from "../utils/uuid";

const DEVICE_ID_KEY = "alert_cia_device_id";
const DEFAULT_LOCAL_SERVER = {
  protocol: "http",
  host: "192.168.100.8",
  port: "4000",
  timeoutMs: 2500,
  discoveryEnabled: false,
  lastSuccessfulConnection: null,
};
const LOCAL_SERVER_CANDIDATES = [
  "http://192.168.100.8:4000",
  "http://192.168.100.1:4000",
  "http://192.168.1.8:4000",
  "http://192.168.0.8:4000",
];

export async function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomUuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function getLocalServerConfig() {
  const offlineSettings = readOfflineSettings();
  const mirrored = offlineSettings.localServerConfig;
  const stored = await getDeviceSetting("localServerConfig");
  const next = {
    ...DEFAULT_LOCAL_SERVER,
    ...(mirrored || {}),
    ...(stored || {}),
  };
  if (stored && JSON.stringify(offlineSettings.localServerConfig) !== JSON.stringify(next)) {
    writeOfflineSettings({
      localServerConfig: next,
      localServerOrigin: localServerUrl(next),
    });
  }
  return next;
}

export function localServerConfigFromOrigin(origin) {
  try {
    const url = new URL(origin);
    return {
      ...DEFAULT_LOCAL_SERVER,
      protocol: url.protocol.replace(":", "") || DEFAULT_LOCAL_SERVER.protocol,
      host: url.hostname || DEFAULT_LOCAL_SERVER.host,
      port: url.port || DEFAULT_LOCAL_SERVER.port,
    };
  } catch {
    return DEFAULT_LOCAL_SERVER;
  }
}

export async function getLocalServerCandidates() {
  const saved = await getLocalServerConfig();
  const origins = [
    localServerUrl(saved),
    localServerUrl(DEFAULT_LOCAL_SERVER),
    ...LOCAL_SERVER_CANDIDATES,
  ];
  return [...new Set(origins)].map(localServerConfigFromOrigin);
}

export async function saveLocalServerConfig(config) {
  const next = {
    ...DEFAULT_LOCAL_SERVER,
    ...config,
    timeoutMs: Number(config.timeoutMs || DEFAULT_LOCAL_SERVER.timeoutMs),
    port: String(config.port || DEFAULT_LOCAL_SERVER.port),
  };
  await putDeviceSetting("localServerConfig", next);
  writeOfflineSettings({
    localServerConfig: next,
    localServerOrigin: localServerUrl(next),
  });
  return next;
}

export async function resetLocalServerConfig() {
  await putDeviceSetting("localServerConfig", DEFAULT_LOCAL_SERVER);
  writeOfflineSettings({
    localServerConfig: DEFAULT_LOCAL_SERVER,
    localServerOrigin: localServerUrl(DEFAULT_LOCAL_SERVER),
  });
  return DEFAULT_LOCAL_SERVER;
}

export function localServerUrl(config = DEFAULT_LOCAL_SERVER) {
  const protocol = config.protocol || "http";
  const host = String(config.host || DEFAULT_LOCAL_SERVER.host).replace(/^https?:\/\//, "");
  const port = config.port ? `:${config.port}` : "";
  return `${protocol}://${host}${port}`;
}
