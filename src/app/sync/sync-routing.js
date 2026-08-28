export function selectDeliveryTarget(operation, connection) {
  if (operation.synced_to_cloud) return { target: null, complete: true };
  if (connection.cloudOnline || connection.mode === "cloud") return { target: "cloud" };
  return {
    target: null,
    waitStatus: "waiting_cloud",
    reason: "Waiting for internet connection to finish synchronization.",
  };
}
