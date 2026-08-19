const IGNORED_KEYS = new Set([
  "sync_status",
  "syncLabel",
  "localStatus",
  "synced_to_cloud",
  "synced_to_local",
  "cloud_synced_at",
  "local_synced_at",
  "updatedAt",
  "updated_at",
  "updated_at_device",
  "created_at_device",
  "last_sync_error",
  "blocked_reason",
  "source",
]);

const FIELD_LABELS = {
  status: "Status",
  patientName: "Patient name",
  age: "Age",
  gender: "Gender",
  address: "Address",
  chiefComplaint: "Chief complaint",
  latitude: "Latitude",
  longitude: "Longitude",
  barangay: "Barangay",
  locationText: "Location",
  placeOfIncident: "Place of incident",
  respondingTeam: "Responding team",
  vehicle: "Vehicle",
  completedAt: "Completed at",
  submittedAt: "Submitted at",
  backToBase: "Back to base",
};

function comparableValue(value) {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) return JSON.stringify(value.map(comparableValue));
  if (typeof value === "object") {
    return JSON.stringify(Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !IGNORED_KEYS.has(key))
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, comparableValue(item)]),
    ));
  }
  return String(value).trim();
}

export function changedSyncFields(localRecord = {}, cloudRecord = {}) {
  const keys = new Set([...Object.keys(localRecord), ...Object.keys(cloudRecord)]);
  return [...keys]
    .filter(key => !IGNORED_KEYS.has(key))
    .filter(key => comparableValue(localRecord[key]) !== comparableValue(cloudRecord[key]))
    .map(key => ({
      key,
      label: FIELD_LABELS[key] || key.replaceAll("_", " "),
      localValue: localRecord[key] ?? null,
      cloudValue: cloudRecord[key] ?? null,
    }));
}

export function hasMeaningfulSyncConflict(localRecord = {}, cloudRecord = {}) {
  return changedSyncFields(localRecord, cloudRecord).length > 0;
}

export function conflictSeverity(changes = []) {
  const important = new Set(["status", "patientName", "chiefComplaint", "latitude", "longitude", "completedAt", "submittedAt", "backToBase"]);
  return changes.some(change => important.has(change.key)) ? "high" : "moderate";
}
