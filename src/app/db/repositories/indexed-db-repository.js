import { addSyncOperation, getAllRecords, getRecord, putRecord } from "../indexed-db";
import { getDeviceId } from "../../services/device-service";
import { createSyncMetadata, RECORD_SOURCES, SYNC_STATUSES } from "../../types/hybrid";
import { randomUuid } from "../../utils/uuid";
import { changedSyncFields, conflictSeverity, hasMeaningfulSyncConflict } from "../../sync/sync-conflicts";

function withLocalFields(record, entityType, source = RECORD_SOURCES.OFFLINE_DEVICE) {
  const id = record.id || record.dispatchId || record.pcrId || randomUuid();
  const responseId = entityType === "dispatch"
    ? record.responseClientId || record.responseId || randomUuid()
    : record.responseId || record.responseClientId || null;
  const dispatchId = entityType === "dispatch" ? record.dispatchId || id : record.dispatchId;
  return {
    ...record,
    id,
    ...(entityType === "dispatch" ? { dispatchId, dispatchClientId: record.dispatchClientId || dispatchId, responseId, responseClientId: responseId } : {}),
    ...(entityType === "pcr" ? { responseId, responseClientId: record.responseClientId || responseId, pcrId: record.pcrId || id, pcrClientId: record.pcrClientId || record.pcrId || id } : {}),
    [`${entityType}Id`]: record[`${entityType}Id`] || id,
    ...createSyncMetadata({
      id,
      entityId: id,
      entityType,
      deviceId: localStorage.getItem("alert_cia_device_id"),
      createdBy: record.createdBy || null,
      source,
      status: SYNC_STATUSES.PENDING,
    }),
  };
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

function dependencyKeys(deviceId, type, entityType, payload) {
  const keys = [];
  const dispatchId = payload.dispatchId || payload.id;
  if (entityType === "dispatch" && type === "update" && dispatchId) {
    keys.push([deviceId, "cloud", "dispatch", dispatchId, "create"].join(":"));
  }
  if (entityType === "pcr") {
    const linkedDispatchId = payload.dispatchId;
    if (linkedDispatchId) {
      keys.push([deviceId, "cloud", "dispatch", linkedDispatchId, "create"].join(":"));
      keys.push([deviceId, "cloud", "dispatch", linkedDispatchId, "update"].join(":"));
    }
  }
  return [...new Set(keys)];
}

function destinationKey(destination) {
  return destination || "cloud";
}

function isStandalonePcr(payload = {}) {
  return payload.workflowOrigin === "reverse"
    || payload.offlineStandalone === true
    || (!payload.dispatchId && !payload.dispatchClientId && !payload.responseId && !payload.responseClientId);
}

function manualDispatchShellFromPcr(record) {
  const dispatchId = record.dispatchId || record.dispatchClientId || randomUuid();
  const responseId = record.responseId || record.responseClientId || randomUuid();
  const patientId = record.patientId || record.dispatchPatientId || randomUuid();
  return {
    id: dispatchId,
    dispatchId,
    dispatchClientId: dispatchId,
    responseId,
    responseClientId: responseId,
    responseNumber: record.responseNumber || `RESP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    status: record.status === "Draft" ? "PCR In Progress" : "Submitted",
    localStatus: record.status === "Draft" ? "PCR Draft on Device" : "Submitted on Device",
    dateOfIncident: record.dateOfIncident || record.timeline?.dateOfIncident || new Date().toISOString().slice(0, 10),
    timeOfIncident: record.timeOfIncident || record.timeline?.timeOfIncident || "",
    placeOfIncident: record.placeOfIncident || record.timeline?.placeOfIncident || record.locationText || "",
    locationText: record.locationText || record.placeOfIncident || record.timeline?.placeOfIncident || "",
    latitude: record.latitude || "",
    longitude: record.longitude || "",
    barangay: record.barangay || "",
    team: record.respondingTeam || record.team || "",
    respondingTeam: record.respondingTeam || record.team || "",
    respondingTeamId: record.respondingTeamId || null,
    vehicle: record.vehicle || "",
    vehicleId: record.vehicleId || null,
    driver: record.driver || "",
    mainAider: record.mainAider || record.fieldOfficer || "",
    groupLeader: record.groupLeader || "",
    assistantAider: record.assistantAider || "",
    typeOfIncident: [...(record.emergencyTypes || []), ...(record.traumaTypes || []), record.emergencyOther, record.incidentNature].filter(Boolean).join(", "),
    natureTypes: [...(record.emergencyTypes || []), ...(record.traumaTypes || [])],
    callerName: record.contactPerson || record.patientName || "",
    callerContact: record.contactNumber || "",
    callerAddress: record.address || "",
    patientName: record.patientName || "",
    age: record.age || "",
    birthday: record.birthday || "",
    gender: record.gender || "",
    address: record.address || "",
    chiefComplaint: record.chiefComplaint || "",
    patients: [{
      id: patientId,
      patientClientId: patientId,
      name: record.patientName || "",
      age: record.age || "",
      birthdate: record.birthday || "",
      gender: record.gender || "",
      address: record.address || "",
      assessmentFindings: record.chiefComplaint || "",
      order: 1,
    }],
    dispatchedTime: record.dispatchTime || record.timeline?.dispatchTime || "",
    arrivalScene: record.arrivalScene || record.timeline?.arrivalScene || "",
    departureScene: record.departureScene || record.timeline?.departureScene || "",
    arrivalHospital: record.arrivalHospital || record.timeline?.arrivalHospital || "",
    departureHospital: record.departureHospital || record.timeline?.departureHospital || "",
    backToBase: record.backToBase || record.timeline?.backToBase || "",
    numberOfPatients: 1,
    syncLabel: "Waiting for internet",
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function ensureManualPcrParent(payload) {
  if (isStandalonePcr(payload)) return {
    ...payload,
    workflowOrigin: "reverse",
    offlineStandalone: true,
  };
  if (payload.responseId && payload.dispatchId) return payload;
  const dispatch = withLocalFields(manualDispatchShellFromPcr(payload), "dispatch", RECORD_SOURCES.OFFLINE_DEVICE);
  await putRecord("local_dispatches", dispatch);
  await queue("create", "dispatch", dispatch, "cloud");
  return {
    ...payload,
    responseId: dispatch.responseId,
    responseClientId: dispatch.responseClientId,
    dispatchId: dispatch.dispatchId,
    dispatchClientId: dispatch.dispatchClientId,
    responseNumber: dispatch.responseNumber,
    patientId: dispatch.patients?.[0]?.id || payload.patientId || null,
    dispatchPatientId: dispatch.patients?.[0]?.id || payload.dispatchPatientId || null,
    patients: dispatch.patients,
  };
}

async function queue(type, entityType, payload, destination = "cloud") {
  const deviceId = await getDeviceId();
  const entityId = payload.id || payload.dispatchId || payload.pcrId || payload.responseId;
  const payloadVersion = Number(payload.sync_version || payload.version || 1);
  return addSyncOperation({
    operation_id: payload.operation_id || randomUuid(),
    operation_type: type,
    entity_type: entityType,
    entity_id: entityId,
    client_generated_id: payload.client_generated_id || payload.local_id || entityId,
    idempotency_key: payload.idempotencyKey || [deviceId, destinationKey(destination), entityType, entityId, type].filter(Boolean).join(":"),
    dependency_keys: dependencyKeys(deviceId, type, entityType, payload).filter(key => key !== [deviceId, destinationKey(destination), entityType, entityId, type].join(":")),
    payload_version: payloadVersion,
    destination,
    device_id: deviceId,
    payload,
  });
}

function sameDispatch(local = {}, cloud = {}) {
  return Boolean(
    (local.id && [cloud.id, cloud.dispatchId, cloud.dispatchClientId].includes(local.id))
    || (local.dispatchId && [cloud.id, cloud.dispatchId, cloud.dispatchClientId].includes(local.dispatchId))
    || (local.dispatchClientId && [cloud.id, cloud.dispatchId, cloud.dispatchClientId].includes(local.dispatchClientId))
    || (local.responseId && local.responseId === cloud.responseId)
    || (local.responseClientId && [cloud.responseId, cloud.responseClientId].includes(local.responseClientId))
  );
}

function samePcr(local = {}, cloud = {}) {
  const localPatientKey = [local.patientName, local.dateOfIncident, local.timeOfIncident, local.latitude, local.longitude]
    .filter(Boolean).map(value => String(value).trim().toLowerCase()).join("|");
  const cloudPatientKey = [cloud.patientName, cloud.dateOfIncident, cloud.timeOfIncident, cloud.latitude, cloud.longitude]
    .filter(Boolean).map(value => String(value).trim().toLowerCase()).join("|");
  return Boolean(
    (local.id && [cloud.id, cloud.pcrId, cloud.pcrClientId].includes(local.id))
    || (local.pcrId && [cloud.id, cloud.pcrId, cloud.pcrClientId].includes(local.pcrId))
    || (local.pcrClientId && [cloud.id, cloud.pcrId, cloud.pcrClientId].includes(local.pcrClientId))
    || (local.responseId && local.responseId === cloud.responseId)
    || (local.responseClientId && [cloud.responseId, cloud.responseClientId].includes(local.responseClientId))
    || (local.responseNumber && local.responseNumber === cloud.responseNumber)
    || (localPatientKey && localPatientKey === cloudPatientKey)
  );
}

function sameOperationTarget(operation = {}, cloud = {}, entityType) {
  const payload = operation.payload || {};
  if (operation.destination !== "cloud" || operation.entity_type !== entityType) return false;
  return entityType === "dispatch" ? sameDispatch(payload, cloud) : samePcr(payload, cloud);
}

async function markMatchingOperationsSynced(entityType, cloudRecord, syncedAt) {
  const rows = await getAllRecords("sync_queue");
  await Promise.all(rows
    .filter(row => sameOperationTarget(row, cloudRecord, entityType))
    .filter(row => !["synced", "completed", "cancelled"].includes(row.sync_status))
    .map(row => putRecord("sync_queue", {
      ...row,
      sync_status: "synced",
      synced_to_cloud: true,
      cloud_synced_at: syncedAt,
      last_sync_error: null,
      blocked_reason: null,
      next_attempt_at: null,
      updated_at_device: syncedAt,
    })));
}

async function markMatchingOperationsConflict(entityType, cloudRecord, conflictId, syncedAt) {
  const rows = await getAllRecords("sync_queue");
  await Promise.all(rows
    .filter(row => sameOperationTarget(row, cloudRecord, entityType))
    .filter(row => !["synced", "completed", "cancelled"].includes(row.sync_status))
    .map(row => putRecord("sync_queue", {
      ...row,
      sync_status: "conflict",
      error_category: "conflict",
      blocked_reason: "Cloud and local records both changed. Review the conflict before syncing.",
      conflict_id: conflictId,
      next_attempt_at: null,
      updated_at_device: syncedAt,
    })));
}

async function createLocalConflict({ storeName, entityType, localRecord, cloudRecord, changes, syncedAt }) {
  const entityId = localRecord.id || localRecord.dispatchId || localRecord.pcrId || cloudRecord.id || cloudRecord.dispatchId || cloudRecord.pcrId;
  const conflictId = `${entityType}:${entityId}`;
  const existing = await getRecord("conflict_records", conflictId);
  const record = {
    id: conflictId,
    entity_type: entityType,
    entity_id: entityId,
    store_name: storeName,
    local_record: localRecord,
    cloud_record: cloudRecord,
    changed_fields: changes,
    conflict_reason: "Local unsynced changes differ from the latest cloud record.",
    conflict_status: existing?.conflict_status || "open",
    severity: existing?.severity || conflictSeverity(changes),
    created_at: existing?.created_at || syncedAt,
    updated_at: syncedAt,
  };
  await putRecord("conflict_records", record);
  await markMatchingOperationsConflict(entityType, cloudRecord, conflictId, syncedAt);
  return record;
}

async function reconcileStoreWithCloud(storeName, entityType, cloudRecords, matcher) {
  if (!cloudRecords?.length) return 0;
  const localRows = await getAllRecords(storeName);
  let reconciled = 0;
  const syncedAt = new Date().toISOString();

  for (const cloudRecord of cloudRecords) {
    const matches = localRows.filter(local => matcher(local, cloudRecord));
    for (const local of matches) {
      if (local.synced_to_cloud && local.syncLabel === "Cloud synced") continue;
      const pendingOperation = (await getAllRecords("sync_queue")).some(row =>
        sameOperationTarget(row, cloudRecord, entityType)
        && !["synced", "completed", "cancelled"].includes(row.sync_status)
      );
      const changes = pendingOperation ? changedSyncFields(local, cloudRecord) : [];
      if (pendingOperation && hasMeaningfulSyncConflict(local, cloudRecord)) {
        await createLocalConflict({ storeName, entityType, localRecord: local, cloudRecord, changes, syncedAt });
        continue;
      }
      const mergedRecord = mergePreservingExisting(local, cloudRecord);
      await putRecord(storeName, {
        ...mergedRecord,
        id: local.id || cloudRecord.id,
        dispatchId: entityType === "dispatch" ? local.dispatchId || mergedRecord.dispatchId || mergedRecord.id : local.dispatchId || mergedRecord.dispatchId,
        pcrId: entityType === "pcr" ? local.pcrId || mergedRecord.pcrId || mergedRecord.id : local.pcrId || mergedRecord.pcrId,
        localStatus: null,
        syncLabel: "Cloud synced",
        sync_status: "synced",
        synced_to_cloud: true,
        cloud_synced_at: mergedRecord.cloud_synced_at || syncedAt,
        last_sync_error: null,
        updatedAt: mergedRecord.updatedAt || mergedRecord.updated_at || syncedAt,
      });
      reconciled += 1;
    }
    await markMatchingOperationsSynced(entityType, cloudRecord, syncedAt);
  }

  return reconciled;
}

export const indexedDbRepository = {
  async createIncident(payload) {
    const record = withLocalFields(payload, "incident");
    await putRecord("local_incidents", record);
    await queue("create", "incident", record);
    return record;
  },

  async createDispatch(payload, { source = RECORD_SOURCES.OFFLINE_DEVICE } = {}) {
    const record = withLocalFields(payload, "dispatch", source);
    await putRecord("local_dispatches", record);
    await queue("create", "dispatch", record);
    return record;
  },

  async cacheAcceptedDispatch(dispatch, pcr = null) {
    const dispatchRecord = withLocalFields({
      ...dispatch,
      status: dispatch.status || "PCR In Progress",
      localStatus: dispatch.localStatus || "Dispatch Received on Device",
    }, "dispatch", RECORD_SOURCES.OFFLINE_DEVICE);
    await putRecord("local_dispatches", dispatchRecord);

    if (pcr) {
      const pcrRecord = withLocalFields({
        ...pcr,
        dispatchId: pcr.dispatchId || dispatchRecord.id,
        responseId: pcr.responseId || dispatchRecord.responseId,
        status: pcr.status || "In Progress",
      }, "pcr", RECORD_SOURCES.OFFLINE_DEVICE);
      await putRecord("local_pcr_reports", pcrRecord);
      await queue("save_draft", "pcr", pcrRecord, "cloud");
    }

    return dispatchRecord;
  },

  async updateDispatch(id, payload) {
    const existing = await getRecord("local_dispatches", id);
    const record = withLocalFields({ ...(existing || {}), ...payload, id }, "dispatch");
    await putRecord("local_dispatches", record);
    await queue("update", "dispatch", record);
    return record;
  },

  async sendDispatch(id, payload = {}) {
    const existing = await getRecord("local_dispatches", id);
    const record = withLocalFields({
      ...(existing || {}),
      ...payload,
      id,
      dispatchId: payload.dispatchId || existing?.dispatchId || id,
      status: payload.status || "Sent to Responding Team",
      localStatus: payload.localStatus || "Sent to Responding Team on Device",
      sentAt: payload.sentAt || existing?.sentAt || new Date().toISOString(),
    }, "dispatch", payload.source || existing?.source || RECORD_SOURCES.OFFLINE_DEVICE);
    await putRecord("local_dispatches", record);
    await queue("update", "dispatch", record, "cloud");
    return record;
  },

  async acknowledgeDispatch(id) {
    const record = withLocalFields({ id, acknowledgedAt: new Date().toISOString() }, "assignment");
    await putRecord("local_assignments", record);
    await queue("acknowledge", "acknowledgement", record);
    return record;
  },

  async savePcrDraft(payload) {
    const parentedPayload = await ensureManualPcrParent(payload);
    const existing = await getRecord("local_pcr_reports", parentedPayload.pcrId || parentedPayload.id);
    const record = withLocalFields({
      ...mergePreservingExisting(existing, parentedPayload),
      status: payload.status || "Draft",
      localStatus: payload.localStatus || "PCR Draft on Device",
      syncLabel: "Waiting for internet",
    }, "pcr");
    await putRecord("local_pcr_reports", record);
    await queue("save_draft", "pcr", record);
    return record;
  },

  async submitPcr(payload) {
    const completedLocally = payload.status !== "Draft";
    const parentedPayload = await ensureManualPcrParent(payload);
    const existing = await getRecord("local_pcr_reports", parentedPayload.pcrId || parentedPayload.id);
    const record = withLocalFields({
      ...mergePreservingExisting(existing, parentedPayload),
      status: completedLocally ? "Submitted" : "Submitted",
      localStatus: completedLocally ? "Submitted on Device" : payload.localStatus,
      syncLabel: "Waiting for internet",
      submittedAt: payload.submittedAt || new Date().toISOString(),
      completedAt: payload.completedAt || "",
      backToBase: payload.backToBase || "",
    }, "pcr", payload.source || RECORD_SOURCES.OFFLINE_DEVICE);
    await putRecord("local_pcr_reports", record);
    await queue("submit", "pcr", record);
    return record;
  },

  async cacheCompletedDispatch(dispatch) {
    if (!dispatch?.id && !dispatch?.dispatchId) return null;
    const id = dispatch.dispatchId || dispatch.id;
    const existing = await getRecord("local_dispatches", id);
    const record = withLocalFields({
      ...(existing || {}),
      ...dispatch,
      id,
      dispatchId: id,
      status: dispatch.status || "Submitted on Device",
      localStatus: dispatch.localStatus || "Submitted on Device",
    }, "dispatch", RECORD_SOURCES.OFFLINE_DEVICE);
    await putRecord("local_dispatches", record);
    await queue("update", "dispatch", record, "cloud");
    return record;
  },

  async markPcrCompletedByResponse(responseId, payload = {}) {
    const rows = await getAllRecords("local_pcr_reports");
    const existing = rows.find(row => row.responseId === responseId || row.response_id === responseId);
    if (!existing) return null;

    const completedAt = payload.completedAt || new Date().toISOString();
    const record = withLocalFields({
      ...existing,
      ...payload,
      id: existing.id || existing.pcrId,
      pcrId: existing.pcrId || existing.id,
      responseId,
      status: "Submitted",
      localStatus: payload.localStatus || "Submitted on Device",
      completedAt,
      sync_status: "pending",
      updatedAt: completedAt,
    }, "pcr", existing.source || RECORD_SOURCES.OFFLINE_DEVICE);
    await putRecord("local_pcr_reports", record);
    await queue("update", "pcr", record, "cloud");
    await queue("completion_status", "completion_status", record, "cloud");
    return record;
  },

  getLocalPcrReport: id => getRecord("local_pcr_reports", id),
  getLocalPcrReports: () => getAllRecords("local_pcr_reports"),
  getLocalDispatchRecord: id => getRecord("local_dispatches", id),
  getLocalDispatchRecords: () => getAllRecords("local_dispatches"),
  getPendingOperations: () => getAllRecords("sync_queue"),
  reconcileCloudDispatches: records => reconcileStoreWithCloud("local_dispatches", "dispatch", records, sameDispatch),
  reconcileCloudPcrReports: records => reconcileStoreWithCloud("local_pcr_reports", "pcr", records, samePcr),
};
