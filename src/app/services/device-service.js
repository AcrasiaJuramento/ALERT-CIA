import { getDeviceSetting, putDeviceSetting } from "../db/indexed-db";
import { randomUuid } from "../utils/uuid";

const DEVICE_ID_KEY = "alert_cia_device_id";
const DEFAULT_LOCAL_SERVER = {
  protocol: "http",
  host: "192.168.1.10",
  port: "4000",
  timeoutMs: 2500,
  discoveryEnabled: false,
  lastSuccessfulConnection: null,
};

export async function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomUuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function getLocalServerConfig() {
  return {
    ...DEFAULT_LOCAL_SERVER,
    ...(await getDeviceSetting("localServerConfig")),
  };
}

export async function saveLocalServerConfig(config) {
  const next = {
    ...DEFAULT_LOCAL_SERVER,
    ...config,
    timeoutMs: Number(config.timeoutMs || DEFAULT_LOCAL_SERVER.timeoutMs),
    port: String(config.port || DEFAULT_LOCAL_SERVER.port),
  };
  await putDeviceSetting("localServerConfig", next);
  return next;
}

export async function resetLocalServerConfig() {
  await putDeviceSetting("localServerConfig", DEFAULT_LOCAL_SERVER);
  return DEFAULT_LOCAL_SERVER;
}

export function localServerUrl(config = DEFAULT_LOCAL_SERVER) {
  const protocol = config.protocol || "http";
  const host = String(config.host || DEFAULT_LOCAL_SERVER.host).replace(/^https?:\/\//, "");
  const port = config.port ? `:${config.port}` : "";
  return `${protocol}://${host}${port}`;
}
