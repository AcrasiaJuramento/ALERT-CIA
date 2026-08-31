import { getAllRecords, getPendingSyncOperations, logSyncEvent, putIdMapping, putRecord, remapQueuedDispatchParentIds } from "../db/indexed-db";
import { cloudClient } from "../api/cloud-client";
import { getConnectionState, checkConnection } from "../network/connection-manager";
import { SYNC_ENTITY_ORDER } from "../types/hybrid";
import { selectDeliveryTarget } from "./sync-routing";

let running = false;
let lastAutoSyncAt = 0;
const SYNC_CONCURRENCY = 2;
const AUTO_SYNC_MIN_INTERVAL_MS = 20000;
const AUTO_SYNC_INTERVAL_MS = 120000;
const WAIT_FOR_CONNECTION_MS = 30000;

function dependencyRank(operation) {
  const index = SYNC_ENTITY_ORDER.indexOf(operation.entity_type);
  return index === -1 ? SYNC_ENTITY_ORDER.length : index;
}

export function classifySyncError(error) {
  const message = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.cause?.message,
    error?.cause?.details,
    error?.cause?.hint,
    error?.cause?.code,
    error,
  ].filter(Boolean).join(" ").toLowerCase();
  if (message.includes("dispatch record was not found") || message.includes("linked response") || message.includes("foreign key") || message.includes("response_id")) {
    return { category: "dependency", status: "waiting_dependency" };
  }
  if (message.includes("current transaction is aborted")) {
    return { category: "transient", status: "retry_scheduled" };
  }
  if (message.includes("duplicate key") || message.includes("already exists") || message.includes("unique constraint") || message.includes("cannot coerce")) {
    return { category: "idempotency", status: "retry_scheduled" };
  }
  if (message.includes("row-level security") || message.includes("not authorized") || message.includes("permission denied") || message.includes("jwt") || message.includes("auth")) {
    return { category: "authorization", status: "authorization_required" };
  }
  if (message.includes("required") || message.includes("invalid payload") || message.includes("permanently deleted")) {
    return { category: "validation", status: "permanent_failure" };
  }
  return { category: "transient", status: "retry_scheduled" };
}

function nextBackoff(attempts) {
  const jitter = Math.floor(Math.random() * 1000 * Math.max(1, attempts));
  const seconds = Math.min(300, 2 ** Math.max(1, attempts));
  return new Date(Date.now() + seconds * 1000 + jitter).toISOString();
}

function operationKey(operation) {
  return operation.idempotency_key || [operation.device_id, operation.destination, operation.entity_type, operation.entity_id, operation.operation_type].filter(Boolean).join(":");
}

function entityKey(operation) {
  return [operation.destination, operation.entity_type, operation.entity_id].filter(Boolean).join(":");
}

function dependencySatisfied(rows, key) {
  const match = rows.find(row => operationKey(row) === key);
  return !match || ["synced", "completed", "partially_synced", "cancelled"].includes(match.sync_status);
}

export function findWaitingDependency(operation, rows) {
  const payload = operation.payload || {};
  const explicit = (operation.dependency_keys || []).find(key => !dependencySatisfied(rows, key));
  if (explicit) return explicit;
  if (operation.entity_type === "pcr") {
    const dispatchId = payload.dispatchId;
    if (!dispatchId) return null;
    const pendingDispatch = rows.find(row =>
      row.entity_type === "dispatch"
      && row.entity_id === dispatchId
      && ["create", "update"].includes(row.operation_type)
      && !["synced", "completed", "partially_synced", "cancelled"].includes(row.sync_status)
    );
    return pendingDispatch ? operationKey(pendingDispatch) : null;
  }
  if (operation.entity_type === "dispatch" && operation.operation_type === "update") {
    const pendingCreate = rows.find(row =>
      row.entity_type === "dispatch"
      && row.entity_id === operation.entity_id
      && row.operation_type === "create"
      && !["synced", "completed", "partially_synced", "cancelled"].includes(row.sync_status)
    );
    return pendingCreate ? operationKey(pendingCreate) : null;
  }
  return null;
}

function shouldStopRetrying(operation, attempts) {
  const error = String(operation.last_sync_error || "").toLowerCase();
  if (error.includes("current transaction is aborted")) return false;
  return attempts >= Number(operation.max_attempts || 6);
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function mergePreservingExisting(existing = {}, incoming = {}) {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (!hasMeaningfulValue(value)) continue;
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && merged[key]
      && typeof merged[key] === "object"
      && !Array.isArray(merged[key])
    ) {
      merged[key] = mergePreservingExisting(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function formatSyncError(error) {
  return [
    error?.message,
    error?.details && `Details: ${error.details}`,
    error?.hint && `Hint: ${error.hint}`,
    error?.code && `Code: ${error.code}`,
    error?.cause?.message && `Cause: ${error.cause.message}`,
    error?.cause?.details && `Cause details: ${error.cause.details}`,
    error?.cause?.hint && `Cause hint: ${error.cause.hint}`,
    error?.cause?.code && `Cause code: ${error.cause.code}`,
  ].filter(Boolean).join(" ") || "Sync failed.";
}

function nextFailureState(operation, error, attempts, formattedError = null) {
  const classified = classifySyncError(error);
  if (classified.status === "waiting_dependency") {
    return {
      attempts: Number(operation.attempts || 0),
      sync_status: "waiting_dependency",
      error_category: classified.category,
      blocked_reason: formattedError || error.message || "Waiting for a required parent record to synchronize.",
      next_attempt_at: new Date(Date.now() + 15000).toISOString(),
    };
  }
  if (classified.status === "authorization_required" || classified.status === "permanent_failure") {
    return {
      attempts,
      sync_status: classified.status,
      error_category: classified.category,
      next_attempt_at: null,
    };
  }
  if (shouldStopRetrying(operation, attempts)) {
    return {
      attempts,
      sync_status: "permanent_failure",
      error_category: classified.category,
      next_attempt_at: null,
    };
  }
  return {
    attempts,
    sync_status: classified.status,
    error_category: classified.category,
    next_attempt_at: nextBackoff(attempts),
  };
}

async function mapLimit(items, limit, worker) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const promise = Promise.resolve().then(() => worker(item));
    results.push(promise);
    executing.add(promise);
    promise.finally(() => executing.delete(promise));
    if (executing.size >= limit) await Promise.race(executing);
  }

  return Promise.all(results);
}

async function cancelOperation(operation, reason) {
  await putRecord("sync_queue", {
    ...operation,
    sync_status: "cancelled",
    blocked_reason: reason,
    next_attempt_at: null,
    updated_at_device: new Date().toISOString(),
  });
}

async function coalesceOperations(operations) {
  const byEntity = new Map();
  const cancelled = [];

  for (const operation of operations) {
    const key = entityKey(operation);
    if (!key) continue;
    const group = byEntity.get(key) || [];
    group.push(operation);
    byEntity.set(key, group);
  }

  for (const group of byEntity.values()) {
    const pcrSubmit = group
      .filter(operation => operation.entity_type === "pcr" && operation.operation_type === "submit")
      .sort((a, b) => Date.parse(b.updated_at_device || b.created_at_device || 0) - Date.parse(a.updated_at_device || a.created_at_device || 0))[0];
    if (!pcrSubmit) continue;
    cancelled.push(...group.filter(operation =>
      operation.id !== pcrSubmit.id
      && operation.entity_type === "pcr"
      && ["save_draft", "update"].includes(operation.operation_type)
    ));
  }

  await Promise.all(cancelled.map(operation => cancelOperation(operation, "Superseded by a newer PCR submit operation for the same record.")));
  const cancelledIds = new Set(cancelled.map(operation => operation.id));
  return operations.filter(operation => !cancelledIds.has(operation.id));
}

function successState(syncedAt) {
  return {
    sync_status: "synced",
    synced_to_cloud: true,
    synced_to_local: false,
    cloud_synced_at: syncedAt,
    local_synced_at: null,
    next_attempt_at: null,
    blocked_reason: null,
  };
}

async function markOperationWaiting(operation, route) {
  await putRecord("sync_queue", {
    ...operation,
    sync_status: "partially_synced",
    error_category: "connection",
    blocked_reason: route.reason,
    next_attempt_at: new Date(Date.now() + WAIT_FOR_CONNECTION_MS).toISOString(),
    updated_at_device: new Date().toISOString(),
  });
}

async function deliver(operation, target) {
  if (target !== "cloud") throw new Error("Unsupported sync destination.");
  if (operation.entity_type === "dispatch" && operation.operation_type === "create") {
    return cloudClient.createDispatch(operation.payload);
  }
  if (operation.entity_type === "dispatch" && operation.operation_type === "update") {
    return cloudClient.updateDispatch(operation.entity_id, operation.payload);
  }
  if (operation.entity_type === "pcr" && operation.operation_type === "submit") {
    return cloudClient.submitPcr(operation.payload);
  }
  if (operation.entity_type === "completion_status" && operation.operation_type === "completion_status") {
    return cloudClient.markResponseBackToBase(operation.payload.responseId || operation.payload.response_id);
  }
  if (operation.entity_type === "pcr") {
    return cloudClient.savePcrDraft(operation.payload);
  }
  if (operation.entity_type === "incident") {
    return cloudClient.createIncident(operation.payload);
  }
  throw new Error(`Unsupported sync operation: ${operation.entity_type}/${operation.operation_type}`);
}

async function recordIdMappings(operation, result) {
  if (!result || typeof result !== "object") return;
  const payload = operation.payload || {};
  const deviceId = operation.device_id;
  if (operation.entity_type === "dispatch") {
    const cloudDispatchId = result.dispatchId || result.id;
    const cloudResponseId = result.responseId || payload.responseId;
    const localDispatchId = payload.dispatchId || payload.id;
    const localResponseId = payload.responseId;
    const dispatchClientId = result.dispatchClientId || payload.dispatchClientId || localDispatchId;
    const responseClientId = result.responseClientId || payload.responseClientId || localResponseId;
    await putIdMapping({
      entityType: "dispatch",
      clientId: dispatchClientId,
      localId: localDispatchId,
      cloudId: cloudDispatchId,
      deviceId,
      metadata: { responseNumber: result.responseNumber },
    });
    if (cloudResponseId || localResponseId) {
      await putIdMapping({
        entityType: "response",
        clientId: responseClientId,
        localId: localResponseId,
        cloudId: cloudResponseId,
        deviceId,
        metadata: { responseNumber: result.responseNumber },
      });
    }
    await remapQueuedDispatchParentIds({
      localDispatchId,
      localResponseId,
      cloudDispatchId,
      cloudResponseId,
      dispatchClientId,
      responseClientId,
    });
  }
  if (operation.entity_type === "pcr") {
    await putIdMapping({
      entityType: "pcr",
      clientId: payload.pcrClientId || payload.pcrId || payload.id,
      localId: payload.pcrId || payload.id,
      cloudId: result.pcrId || result.id,
      deviceId,
      metadata: { responseId: result.responseId || payload.responseId },
    });
  }
}

async function markLocalRecordSynced(operation, result, syncedAt) {
  if (operation.destination !== "cloud") return;
  const payload = operation.payload || {};
  if (operation.entity_type === "dispatch") {
    const id = payload.id || payload.dispatchId || operation.entity_id;
    if (!id) return;
    await putRecord("local_dispatches", {
      ...payload,
      ...result,
      id,
      dispatchId: payload.dispatchId || result.dispatchId || result.id || id,
      status: result.status || payload.status,
      localStatus: null,
      syncLabel: "Cloud synced",
      synced_to_cloud: true,
      cloud_synced_at: syncedAt,
      updatedAt: syncedAt,
    });
  }
  if (operation.entity_type === "pcr") {
    const id = payload.id || payload.pcrId || operation.entity_id;
    if (!id) return;
    const record = mergePreservingExisting(payload, result);
    await putRecord("local_pcr_reports", {
      ...record,
      id,
      pcrId: payload.pcrId || record.pcrId || record.id || id,
      status: result.status || payload.status,
      localStatus: null,
      syncLabel: "Cloud synced",
      synced_to_cloud: true,
      cloud_synced_at: syncedAt,
      updatedAt: syncedAt,
    });
  }
}

export async function runSyncNow({ includeNotDue = false } = {}) {
  if (running) return { skipped: true, reason: "sync_already_running" };
  running = true;
  const summary = { processed: 0, synced: 0, failed: 0, waiting: 0, cancelled: 0 };

  try {
    const connection = await checkConnection({ force: includeNotDue });
    if (connection.mode === "offline") return { ...summary, skipped: true, reason: "offline" };
    const allOperations = await getAllRecords("sync_queue");
    const operations = (await coalesceOperations(await getPendingSyncOperations({ includeNotDue })))
      .sort((a, b) => dependencyRank(a) - dependencyRank(b));
    summary.cancelled = (await getAllRecords("sync_queue")).filter(row => row.sync_status === "cancelled").length;

    async function processOperation(operation) {
      summary.processed += 1;
      try {
        const waitingOn = findWaitingDependency(operation, allOperations);
        if (waitingOn) {
          await putRecord("sync_queue", {
            ...operation,
            sync_status: "waiting_dependency",
            error_category: "dependency",
            blocked_reason: `Waiting for required operation: ${waitingOn}`,
            next_attempt_at: new Date(Date.now() + 15000).toISOString(),
            updated_at_device: new Date().toISOString(),
          });
          summary.waiting += 1;
          return;
        }

        const route = selectDeliveryTarget(operation, connection);
        if (route.complete) {
          const syncedAt = new Date().toISOString();
          await putRecord("sync_queue", {
            ...operation,
            sync_status: "synced",
            next_attempt_at: null,
            blocked_reason: null,
            updated_at_device: syncedAt,
            last_sync_error: null,
          });
          summary.synced += 1;
          return;
        }
        if (!route.target) {
          await markOperationWaiting(operation, route);
          summary.waiting += 1;
          return;
        }

        const attempts = Number(operation.attempts || 0) + 1;
        await putRecord("sync_queue", { ...operation, attempts, sync_status: "uploading", updated_at_device: new Date().toISOString() });
        const result = await deliver(operation, route.target);
        await recordIdMappings(operation, result);
        const syncedAt = new Date().toISOString();
        if (route.target === "cloud") await markLocalRecordSynced(operation, result, syncedAt);
        const syncedState = successState(syncedAt);
        await putRecord("sync_queue", {
          ...operation,
          attempts,
          ...syncedState,
          updated_at_device: syncedAt,
          last_sync_error: null,
        });
        const operationIndex = allOperations.findIndex(row => row.id === operation.id);
        const syncedOperation = {
          ...operation,
          attempts,
          ...syncedState,
        };
        if (operationIndex >= 0) allOperations[operationIndex] = syncedOperation;
        else allOperations.push(syncedOperation);
        await logSyncEvent({ operation_id: operation.operation_id, status: syncedState.sync_status, destination: route.target });
        summary.synced += 1;
      } catch (error) {
        const errorMessage = formatSyncError(error);
        const attempts = classifySyncError(error).status === "waiting_dependency"
          ? Number(operation.attempts || 0)
          : Number(operation.attempts || 0) + 1;
        const failureState = nextFailureState(operation, error, attempts, errorMessage);
        await putRecord("sync_queue", {
          ...operation,
          ...failureState,
          updated_at_device: new Date().toISOString(),
          last_sync_error: errorMessage,
        });
        await logSyncEvent({ operation_id: operation.operation_id, status: "failed", error: errorMessage });
        summary.failed += 1;
      }
    }

    const byRank = new Map();
    for (const operation of operations) {
      const rank = dependencyRank(operation);
      const group = byRank.get(rank) || [];
      group.push(operation);
      byRank.set(rank, group);
    }

    for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
      await mapLimit(byRank.get(rank), SYNC_CONCURRENCY, processOperation);
    }

    return summary;
  } finally {
    running = false;
  }
}

export function scheduleSyncTriggers() {
  const trigger = ({ force = false } = {}) => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (!force && now - lastAutoSyncAt < AUTO_SYNC_MIN_INTERVAL_MS) return;
    lastAutoSyncAt = now;
    const state = getConnectionState();
    if (state.mode !== "offline") runSyncNow();
  };
  const onFocus = () => trigger({ force: true });
  const onOnline = () => trigger({ force: true });
  const onVisibility = () => {
    if (document.visibilityState === "visible") trigger({ force: true });
  };
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  const interval = window.setInterval(trigger, AUTO_SYNC_INTERVAL_MS);
  trigger({ force: true });
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
