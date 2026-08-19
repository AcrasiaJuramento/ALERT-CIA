export function selectDeliveryTarget(operation, connection) {
  if (operation.destination === "local") {
    if (operation.synced_to_local) return { target: null, complete: true };
    if (connection.localOnline || connection.mode === "local") return { target: "local" };
    return { target: null, waitStatus: "waiting_local", reason: "Waiting for local ALERT-CIA server connection." };
  }

  if (operation.destination === "cloud") {
    if (operation.synced_to_cloud) return { target: null, complete: true };
    if (connection.cloudOnline) return { target: "cloud" };
    if (!operation.synced_to_local && (connection.localOnline || connection.mode === "local")) return { target: "local" };
    return { target: null, waitStatus: "waiting_cloud", reason: "Waiting for cloud connection to finish synchronization." };
  }

  if (connection.cloudOnline || connection.mode === "cloud") return { target: "cloud" };
  if (connection.localOnline || connection.mode === "local") return { target: "local" };
  return { target: null, waitStatus: "waiting_connection", reason: "Waiting for an available sync destination." };
}
