export function gpsAccuracyLabel(accuracy) {
  if (!Number.isFinite(accuracy)) return "Unknown accuracy";
  if (accuracy <= 25) return "High accuracy";
  if (accuracy <= 75) return "Usable accuracy";
  if (accuracy <= 150) return "Weak accuracy";
  return "Low accuracy";
}

export function gpsAccuracyTone(accuracy, status = "active") {
  if (["denied", "unsupported", "unavailable", "timeout"].includes(status)) return "danger";
  if (!Number.isFinite(accuracy)) return "warning";
  if (accuracy <= 75) return "success";
  if (accuracy <= 150) return "warning";
  return "danger";
}

export function gpsStatusMessage(status, accuracy) {
  if (status === "denied") return "GPS permission denied. Use manual position confirmation.";
  if (status === "unsupported") return "This browser does not support GPS. Use manual position confirmation.";
  if (status === "timeout") return "GPS timed out. Confirm the responder position manually if needed.";
  if (status === "unavailable") return "GPS is unavailable. Confirm the responder position manually.";
  if (status === "offline") return "GPS fix available while offline.";
  if (status === "weak") return "GPS signal is weak. Confirm the marker before navigating.";
  return Number.isFinite(accuracy)
    ? `${gpsAccuracyLabel(accuracy)} (${Math.round(accuracy)} m).`
    : "Waiting for GPS accuracy.";
}
