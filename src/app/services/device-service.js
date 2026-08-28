import { randomUuid } from "../utils/uuid";

const DEVICE_ID_KEY = "alert_cia_device_id";

export async function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomUuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
