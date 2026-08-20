import { randomUuid } from "../utils/uuid";

const DB_NAME = "alert-cia-hybrid";
const DB_VERSION = 3;

export const STORES = [
  "local_incidents",
  "local_dispatches",
  "local_assignments",
  "local_pcr_reports",
  "local_patients",
  "local_vital_signs",
  "local_treatments",
  "local_transport_records",
  "local_attachments",
  "local_signatures",
  "cached_reference_data",
  "sync_queue",
  "sync_logs",
  "device_settings",
  "conflict_records",
  "sync_id_mappings",
];

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "id" });
          store.createIndex("sync_status", "sync_status", { unique: false });
          store.createIndex("updated_at_device", "updated_at_device", { unique: false });
        }
      }
      const queue = request.transaction.objectStore("sync_queue");
      if (!queue.indexNames.contains("entity_type")) queue.createIndex("entity_type", "entity_type", { unique: false });
      if (!queue.indexNames.contains("entity_id")) queue.createIndex("entity_id", "entity_id", { unique: false });
      if (!queue.indexNames.contains("operation_id")) queue.createIndex("operation_id", "operation_id", { unique: true });
      if (!queue.indexNames.contains("idempotency_key")) queue.createIndex("idempotency_key", "idempotency_key", { unique: false });
      if (!queue.indexNames.contains("next_attempt_at")) queue.createIndex("next_attempt_at", "next_attempt_at", { unique: false });
      if (!queue.indexNames.contains("destination")) queue.createIndex("destination", "destination", { unique: false });
      const reference = request.transaction.objectStore("cached_reference_data");
      if (!reference.indexNames.contains("dataset")) reference.createIndex("dataset", "dataset", { unique: false });
      if (!reference.indexNames.contains("version")) reference.createIndex("version", "version", { unique: false });
      const mappings = request.transaction.objectStore("sync_id_mappings");
      if (!mappings.indexNames.contains("entity_type")) mappings.createIndex("entity_type", "entity_type", { unique: false });
      if (!mappings.indexNames.contains("client_id")) mappings.createIndex("client_id", "client_id", { unique: false });
      if (!mappings.indexNames.contains("cloud_id")) mappings.createIndex("cloud_id", "cloud_id", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function transaction(storeName, mode = "readonly") {
  return openDb().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putRecord(storeName, record) {
  const store = await transaction(storeName, "readwrite");
  await requestToPromise(store.put(record));
  return record;
}

export async function getRecord(storeName, id) {
  const store = await transaction(storeName);
  return requestToPromise(store.get(id));
}

export async function getAllRecords(storeName) {
  const store = await transaction(storeName);
  return requestToPromise(store.getAll());
}

export async function deleteRecord(storeName, id) {
  const store = await transaction(storeName, "readwrite");
  return requestToPromise(store.delete(id));
}

export async function addSyncOperation(operation) {
  const now = new Date().toISOString();
  const rows = await getAllRecords("sync_queue");
  const existing = rows.find(row =>
    row.idempotency_key
    && row.idempotency_key === operation.idempotency_key
    && !["synced", "completed", "cancelled", "permanent_failure", "authorization_required"].includes(row.sync_status)
  );
  const completed = rows.find(row =>
    row.idempotency_key
    && row.idempotency_key === operation.idempotency_key
    && ["synced", "completed"].includes(row.sync_status)
  );
  if (completed) return completed;

  const operationId = existing?.operation_id || operation.operation_id || operation.id || randomUuid();
  const syncStatus = existing?.sync_status === "failed" ? "pending" : existing?.sync_status || operation.sync_status || "pending";
  return putRecord("sync_queue", {
    id: existing?.id || operationId,
    operation_id: operationId,
    max_attempts: 6,
    next_attempt_at: now,
    synced_to_local: false,
    synced_to_cloud: false,
    local_synced_at: null,
    cloud_synced_at: null,
    dependency_keys: [],
    error_category: null,
    blocked_reason: null,
    payload_version: 1,
    ...(existing || {}),
    ...operation,
    attempts: existing?.attempts || 0,
    sync_status: syncStatus,
    created_at_device: existing?.created_at_device || now,
    updated_at_device: now,
  });
}

export async function getPendingSyncOperations({ includeNotDue = false } = {}) {
  const rows = await getAllRecords("sync_queue");
  const now = Date.now();
  const staleUploadingCutoff = now - 2 * 60 * 1000;
  return rows
    .filter(row =>
      ["pending", "failed", "partially_synced", "retry_scheduled", "waiting_dependency"].includes(row.sync_status)
      || (row.sync_status === "uploading" && Date.parse(row.updated_at_device || row.created_at_device || 0) < staleUploadingCutoff)
    )
    .filter(row => includeNotDue || !row.next_attempt_at || Date.parse(row.next_attempt_at) <= now)
    .sort((a, b) => Date.parse(a.created_at_device) - Date.parse(b.created_at_device));
}

export async function logSyncEvent(entry) {
  return putRecord("sync_logs", {
    id: entry.id || randomUuid(),
    created_at: new Date().toISOString(),
    ...entry,
  });
}

export async function retryFailedSyncOperations() {
  const rows = await getAllRecords("sync_queue");
  const now = new Date().toISOString();
  const failedRows = rows.filter(row => ["failed", "retry_scheduled", "waiting_dependency", "authorization_required", "permanent_failure"].includes(row.sync_status));
  await Promise.all(failedRows.map(row => putRecord("sync_queue", {
    ...row,
    attempts: 0,
    sync_status: "pending",
    error_category: null,
    blocked_reason: null,
    last_sync_error: null,
    next_attempt_at: now,
    updated_at_device: now,
  })));
  return failedRows.length;
}

function isFieldOfficerCachedDispatch(operation) {
  const localStatus = operation.payload?.localStatus;
  const status = operation.payload?.status;
  return operation.entity_type === "dispatch"
    && ["create", "update"].includes(operation.operation_type)
    && operation.destination === "cloud"
    && (
      localStatus === "Dispatch Received Locally"
      || localStatus === "PCR Completed Locally"
      || (localStatus === "Submitted Locally" && status !== "Sent to Responding Team")
    );
}

function isDispatcherOwnedLocalDispatch(operation) {
  const localStatus = operation.payload?.localStatus;
  const status = operation.payload?.status;
  return operation.entity_type === "dispatch"
    && ["create", "update"].includes(operation.operation_type)
    && operation.destination === "cloud"
    && operation.payload?.source === "local_server"
    && !["Dispatch Received Locally", "PCR Completed Locally"].includes(localStatus)
    && !(localStatus === "Submitted Locally" && status !== "Sent to Responding Team");
}

export async function repairPoisonedSyncOperations() {
  const rows = await getAllRecords("sync_queue");
  const now = new Date().toISOString();
  const cancelledKeys = new Set();
  let repaired = 0;

  for (const row of rows) {
    if (
      row.sync_status === "cancelled"
      && isDispatcherOwnedLocalDispatch(row)
      && String(row.blocked_reason || "").includes("field-officer cached dispatch")
    ) {
      await putRecord("sync_queue", {
        ...row,
        attempts: 0,
        sync_status: "pending",
        error_category: null,
        blocked_reason: null,
        last_sync_error: null,
        next_attempt_at: now,
        updated_at_device: now,
      });
      repaired += 1;
      continue;
    }

    if (!isFieldOfficerCachedDispatch(row)) continue;
    cancelledKeys.add(row.idempotency_key);
    await putRecord("sync_queue", {
      ...row,
      sync_status: "cancelled",
      error_category: "authorization",
      blocked_reason: "Cancelled field-officer cached dispatch cloud write. The dispatcher-owned dispatch/response must sync from the dispatcher or trusted local server.",
      next_attempt_at: null,
      updated_at_device: now,
    });
    repaired += 1;
  }

  for (const row of rows) {
    const error = String(row.last_sync_error || "").toLowerCase();
    if (
      error.includes("current transaction is aborted")
      && ["waiting_dependency", "permanent_failure", "failed", "retry_scheduled"].includes(row.sync_status)
    ) {
      await putRecord("sync_queue", {
        ...row,
        attempts: 0,
        sync_status: "pending",
        error_category: "transient",
        blocked_reason: null,
        last_sync_error: null,
        next_attempt_at: now,
        updated_at_device: now,
      });
      repaired += 1;
      continue;
    }

    if (
      row.entity_type === "pcr"
      && error.includes("cannot coerce")
      && ["permanent_failure", "failed", "retry_scheduled"].includes(row.sync_status)
    ) {
      await putRecord("sync_queue", {
        ...row,
        attempts: 0,
        sync_status: "pending",
        error_category: "idempotency",
        blocked_reason: null,
        last_sync_error: null,
        next_attempt_at: now,
        updated_at_device: now,
      });
      repaired += 1;
      continue;
    }

    if (
      row.entity_type === "dispatch"
      && row.operation_type === "update"
      && error.includes("dispatch record was not found")
      && ["waiting_dependency", "permanent_failure", "failed", "retry_scheduled"].includes(row.sync_status)
    ) {
      await putRecord("sync_queue", {
        ...row,
        attempts: 0,
        dependency_keys: [],
        sync_status: "pending",
        error_category: "dependency",
        blocked_reason: null,
        next_attempt_at: now,
        updated_at_device: now,
      });
      repaired += 1;
      continue;
    }

    const dependencyKeys = (row.dependency_keys || []).filter(key => !cancelledKeys.has(key));
    if (dependencyKeys.length === (row.dependency_keys || []).length) continue;
    await putRecord("sync_queue", {
      ...row,
      dependency_keys: dependencyKeys,
      sync_status: ["waiting_dependency", "failed", "retry_scheduled", "permanent_failure"].includes(row.sync_status) ? "pending" : row.sync_status,
      next_attempt_at: now,
      blocked_reason: null,
      updated_at_device: now,
    });
    repaired += 1;
  }

  return repaired;
}

export async function putIdMapping({ entityType, clientId, localId, cloudId, deviceId, metadata = {} }) {
  if (!entityType || !clientId || !cloudId) return null;
  const now = new Date().toISOString();
  return putRecord("sync_id_mappings", {
    id: `${entityType}:${clientId}`,
    entity_type: entityType,
    client_id: clientId,
    local_id: localId || clientId,
    cloud_id: cloudId,
    device_id: deviceId || null,
    metadata,
    updated_at: now,
    created_at: (await getRecord("sync_id_mappings", `${entityType}:${clientId}`))?.created_at || now,
  });
}

function matchesAny(value, candidates) {
  return value && candidates.has(value);
}

function parentMatch(payload = {}, dispatchIds, responseIds) {
  return matchesAny(payload.dispatchId, dispatchIds)
    || matchesAny(payload.dispatchClientId, dispatchIds)
    || matchesAny(payload.responseId, responseIds)
    || matchesAny(payload.responseClientId, responseIds);
}

function remapPayloadParent(payload = {}, mapping) {
  return {
    ...payload,
    dispatchId: mapping.cloudDispatchId || payload.dispatchId,
    dispatchClientId: payload.dispatchClientId || mapping.localDispatchId || mapping.dispatchClientId || payload.dispatchId,
    responseId: mapping.cloudResponseId || payload.responseId,
    responseClientId: payload.responseClientId || mapping.localResponseId || mapping.responseClientId || payload.responseId,
  };
}

function remapDependencyKeys(keys = [], dispatchIds) {
  return keys.filter(key => ![...dispatchIds].some(dispatchId => String(key).includes(`:dispatch:${dispatchId}:`)));
}

export async function remapQueuedDispatchParentIds(mapping = {}) {
  const dispatchIds = new Set([
    mapping.localDispatchId,
    mapping.dispatchClientId,
    mapping.cloudDispatchId,
  ].filter(Boolean));
  const responseIds = new Set([
    mapping.localResponseId,
    mapping.responseClientId,
    mapping.cloudResponseId,
  ].filter(Boolean));

  if ((!dispatchIds.size && !responseIds.size) || (!mapping.cloudDispatchId && !mapping.cloudResponseId)) return 0;

  const now = new Date().toISOString();
  let updated = 0;

  const pcrRows = await getAllRecords("local_pcr_reports");
  await Promise.all(pcrRows
    .filter(row => parentMatch(row, dispatchIds, responseIds))
    .map(row => {
      updated += 1;
      return putRecord("local_pcr_reports", {
        ...remapPayloadParent(row, mapping),
        id: row.id,
        pcrId: row.pcrId || row.id,
        updated_at_device: now,
        updatedAt: row.updatedAt || now,
      });
    }));

  const queueRows = await getAllRecords("sync_queue");
  await Promise.all(queueRows
    .filter(row => row.entity_type === "pcr" && parentMatch(row.payload || {}, dispatchIds, responseIds))
    .filter(row => !["synced", "completed", "cancelled"].includes(row.sync_status))
    .map(row => {
      updated += 1;
      const dependencyKeys = remapDependencyKeys(row.dependency_keys || [], dispatchIds);
      const wasBlockedOnParent = row.sync_status === "waiting_dependency" || row.error_category === "dependency";
      return putRecord("sync_queue", {
        ...row,
        payload: remapPayloadParent(row.payload || {}, mapping),
        dependency_keys: dependencyKeys,
        sync_status: wasBlockedOnParent ? "pending" : row.sync_status,
        error_category: wasBlockedOnParent ? null : row.error_category,
        blocked_reason: wasBlockedOnParent ? null : row.blocked_reason,
        last_sync_error: wasBlockedOnParent ? null : row.last_sync_error,
        next_attempt_at: wasBlockedOnParent ? now : row.next_attempt_at,
        updated_at_device: now,
      });
    }));

  return updated;
}

export async function putDeviceSetting(key, value) {
  return putRecord("device_settings", { id: key, value, updated_at: new Date().toISOString() });
}

export async function getDeviceSetting(key) {
  return (await getRecord("device_settings", key))?.value;
}

function conflictStoreName(conflict = {}) {
  if (conflict.store_name) return conflict.store_name;
  if (conflict.entity_type === "dispatch") return "local_dispatches";
  if (conflict.entity_type === "pcr") return "local_pcr_reports";
  if (conflict.entity_type === "incident") return "local_incidents";
  return null;
}

export async function resolveSyncConflict(conflictId, resolution) {
  const conflict = await getRecord("conflict_records", conflictId);
  if (!conflict) throw new Error("Conflict record was not found.");
  const now = new Date().toISOString();
  const rows = await getAllRecords("sync_queue");
  const blockedOperations = rows.filter(row => row.conflict_id === conflictId || (
    row.entity_type === conflict.entity_type
    && row.entity_id === conflict.entity_id
    && row.sync_status === "conflict"
  ));

  if (resolution === "cloud") {
    const storeName = conflictStoreName(conflict);
    if (storeName && conflict.cloud_record) {
      await putRecord(storeName, {
        ...conflict.local_record,
        ...conflict.cloud_record,
        id: conflict.local_record?.id || conflict.cloud_record?.id,
        dispatchId: conflict.entity_type === "dispatch"
          ? conflict.local_record?.dispatchId || conflict.cloud_record?.dispatchId || conflict.cloud_record?.id
          : conflict.local_record?.dispatchId || conflict.cloud_record?.dispatchId,
        pcrId: conflict.entity_type === "pcr"
          ? conflict.local_record?.pcrId || conflict.cloud_record?.pcrId || conflict.cloud_record?.id
          : conflict.local_record?.pcrId || conflict.cloud_record?.pcrId,
        sync_status: "synced",
        syncLabel: "Cloud synced",
        localStatus: null,
        synced_to_cloud: true,
        cloud_synced_at: now,
        updatedAt: conflict.cloud_record.updatedAt || conflict.cloud_record.updated_at || now,
      });
    }
    await Promise.all(blockedOperations.map(row => putRecord("sync_queue", {
      ...row,
      sync_status: "cancelled",
      blocked_reason: "Conflict resolved by accepting the cloud record.",
      next_attempt_at: null,
      updated_at_device: now,
    })));
  }

  if (resolution === "local") {
    await Promise.all(blockedOperations.map(row => putRecord("sync_queue", {
      ...row,
      attempts: 0,
      sync_status: "pending",
      error_category: null,
      blocked_reason: null,
      last_sync_error: null,
      next_attempt_at: now,
      updated_at_device: now,
    })));
  }

  await putRecord("conflict_records", {
    ...conflict,
    conflict_status: "resolved",
    resolution,
    resolved_at: now,
    updated_at: now,
  });

  return { ...conflict, conflict_status: "resolved", resolution, resolved_at: now };
}
