import { getLocalServerConfig, localServerUrl } from "../services/device-service";

const listeners = new Set();
let socket;

function emit(event) {
  for (const listener of listeners) listener(event);
}

export function subscribeLocalDispatchEvents(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function connectLocalDispatchSocket() {
  const config = await getLocalServerConfig();
  const base = localServerUrl(config).replace(/^http/, "ws");
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return socket;

  socket = new WebSocket(`${base}/dispatch`);
  socket.onopen = () => emit({ type: "socket_open" });
  socket.onclose = () => emit({ type: "socket_closed" });
  socket.onerror = () => emit({ type: "socket_error" });
  socket.onmessage = message => {
    try {
      emit(JSON.parse(message.data));
    } catch {
      emit({ type: "socket_message", payload: message.data });
    }
  };
  return socket;
}

export function sendLocalDispatchEvent(type, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type, payload, sent_at: new Date().toISOString() }));
  return true;
}
