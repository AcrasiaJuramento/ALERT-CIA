import { randomUuid } from "../utils/uuid";

export const CONNECTION_MODES = Object.freeze({
  CLOUD: "cloud",
  LOCAL: "local",
  OFFLINE: "offline",
});

export const SYNC_STATUSES = Object.freeze({
  LOCAL_ONLY: "local_only",
  PENDING: "pending",
  PROCESSING: "processing",
  WAITING_DEPENDENCY: "waiting_dependency",
  RETRY_SCHEDULED: "retry_scheduled",
  UPLOADING: "uploading",
  PARTIALLY_SYNCED: "partially_synced",
  SYNCED: "synced",
  FAILED: "failed",
  PERMANENT_FAILURE: "permanent_failure",
  AUTHORIZATION_REQUIRED: "authorization_required",
  CONFLICT: "conflict",
  CANCELLED: "cancelled",
});

export const RECORD_SOURCES = Object.freeze({
  CLOUD: "cloud",
  LOCAL_SERVER: "local_server",
  OFFLINE_DEVICE: "offline_device",
});

export const SYNC_DESTINATIONS = Object.freeze({
  CLOUD: "cloud",
  LOCAL: "local",
});

export const SYNC_ENTITY_ORDER = [
  "incident",
  "dispatch",
  "assignment",
  "acknowledgement",
  "pcr",
  "patient",
  "assessment",
  "vital_signs",
  "treatment",
  "transport",
  "handover",
  "attachment",
  "signature",
  "completion_status",
];

export function createSyncMetadata({
  id = randomUuid(),
  entityType,
  entityId = id,
  createdBy = null,
  deviceId,
  source,
  status = SYNC_STATUSES.PENDING,
} = {}) {
  const now = new Date().toISOString();
  return {
    id,
    local_id: id,
    server_id: null,
    entity_type: entityType,
    entity_id: entityId,
    created_by: createdBy,
    device_id: deviceId,
    created_at_device: now,
    updated_at_device: now,
    version: 1,
    operational_status: "active",
    sync_status: status,
    sync_attempts: 0,
    last_sync_error: null,
    source,
    synced_to_local: false,
    synced_to_cloud: false,
    local_synced_at: null,
    cloud_synced_at: null,
  };
}
