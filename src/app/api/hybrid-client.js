import { cloudClient } from "./cloud-client";
import { localServerClient } from "./local-server-client";
import { indexedDbRepository } from "../db/repositories/indexed-db-repository";
import { getConnectionState, checkConnection } from "../network/connection-manager";
import { RECORD_SOURCES } from "../types/hybrid";
import { randomUuid } from "../utils/uuid";

function localNotice(record, message) {
  return {
    ...record,
    hybridMessage: message,
  };
}

async function currentMode() {
  const state = getConnectionState();
  if (!state.lastCheckedAt) return (await checkConnection({ force: true })).mode;
  return state.mode;
}

function assertCanSendDispatch(record) {
  if (!record) return;
  const completed = String(record.status || "").includes("PCR Completed")
    || String(record.localStatus || "").includes("PCR Completed")
    || ["Submitted", "Submitted Locally", "Verified"].includes(record.status)
    || ["Submitted Locally", "Verified"].includes(record.localStatus);
  if (completed) throw new Error("This dispatch already has a completed PCR and cannot be sent again.");
}

async function mirrorDispatchToLocalServer(record) {
  if (!record || !getConnectionState().localOnline) return null;
  const localId = record.dispatchId || record.id;
  try {
    await localServerClient.getDispatch(localId);
    return localServerClient.updateDispatch(localId, record);
  } catch {
    return localServerClient.createDispatch(record);
  }
}

function latestVital(payload = {}) {
  return [...(payload.vitals || [])].reverse().find(row =>
    [row?.bp, row?.pulse, row?.respiratory, row?.temperature, row?.oxygen].some(Boolean)
  ) || {};
}

function gcsTotal(payload = {}) {
  const row = [...(payload.gcsRows || (payload.gcs ? [payload.gcs] : []))].reverse().find(item =>
    [item?.eye, item?.verbal, item?.motor].some(Boolean)
  ) || {};
  const total = [row.eye, row.verbal, row.motor].reduce((sum, score) => sum + Number(score || 0), 0);
  return total || "";
}

function positiveNegative(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["positive", "+", "yes"].includes(normalized)) return "+";
  if (["negative", "-", "no"].includes(normalized)) return "-";
  if (["n/a", "n-a", "na", "unknown", "not applicable"].includes(normalized)) return "Unknown";
  return value || "";
}

function patientVehicleRole(crash = {}) {
  const role = String(crash.role || "").toLowerCase();
  return {
    driver: role.includes("driver"),
    passenger: role.includes("passenger"),
    pedestrian: role.includes("pedestrian"),
  };
}

function manualDispatchShellFromPcr(payload) {
  const dispatchId = payload.dispatchId || payload.dispatchClientId || randomUuid();
  const responseId = payload.responseId || payload.responseClientId || randomUuid();
  const vital = latestVital(payload);
  const vehicleRole = patientVehicleRole(payload.crash);
  return {
    id: dispatchId,
    dispatchId,
    dispatchClientId: dispatchId,
    responseId,
    responseClientId: responseId,
    responseNumber: payload.responseNumber?.startsWith("RESP-") ? payload.responseNumber : `RESP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    status: payload.status === "Draft" ? "PCR In Progress" : "Submitted",
    localStatus: payload.status === "Draft" ? "PCR Draft Locally" : "Submitted Locally",
    dateOfIncident: payload.dateOfIncident || payload.timeline?.dateOfIncident,
    timeOfIncident: payload.timeOfIncident || payload.timeline?.timeOfIncident,
    placeOfIncident: payload.placeOfIncident || payload.timeline?.placeOfIncident || payload.locationText,
    locationText: payload.locationText || payload.placeOfIncident || payload.timeline?.placeOfIncident,
    latitude: payload.latitude,
    longitude: payload.longitude,
    barangay: payload.barangay,
    team: payload.respondingTeam || payload.team,
    respondingTeam: payload.respondingTeam || payload.team,
    respondingTeamId: payload.respondingTeamId,
    vehicle: payload.vehicle,
    vehicleId: payload.vehicleId,
    driver: payload.driver,
    mainAider: payload.mainAider,
    groupLeader: payload.groupLeader,
    assistantAider: payload.assistantAider,
    typeOfIncident: [...(payload.emergencyTypes || []), ...(payload.traumaTypes || []), payload.emergencyOther, payload.incidentNature].filter(Boolean).join(", "),
    natureTypes: [...(payload.emergencyTypes || []), ...(payload.traumaTypes || [])],
    callerName: payload.contactPerson || payload.patientName,
    callerContact: payload.contactNumber,
    callerAddress: payload.address,
    patientName: payload.patientName,
    age: payload.age,
    birthday: payload.birthday,
    gender: payload.gender,
    address: payload.address,
    chiefComplaint: payload.chiefComplaint,
    selfAccident: Boolean(payload.crash?.selfAccident),
    collision: Boolean(payload.crash?.collision),
    vehicleInvolved: payload.crash?.vehicle || "",
    otherMedical: payload.emergencyOther || "",
    otherTrauma: payload.traumaOther || "",
    incidentNature: payload.incidentNature || "",
    ifIngestion: payload.ingestionItem || "",
    quantity: payload.ingestionQuantity || "",
    ifFall: payload.fallDetails || "",
    patients: [{
      id: payload.patientId || payload.dispatchPatientId || randomUuid(),
      patientClientId: payload.patientId || payload.dispatchPatientId || undefined,
      name: payload.patientName,
      age: payload.age,
      birthdate: payload.birthday,
      gender: payload.gender,
      address: payload.address,
      assessmentFindings: payload.chiefComplaint,
      bp: vital.bp || "",
      pr: vital.pulse || "",
      rr: vital.respiratory || "",
      temp: vital.temperature || "",
      o2Sat: vital.oxygen || "",
      gcs: gcsTotal(payload),
      ...vehicleRole,
      helmet: positiveNegative(payload.crash?.helmet),
      alcoholBreath: positiveNegative(payload.crash?.alcohol),
      driversLicense: positiveNegative(payload.crash?.license),
      g: payload.obstetric?.g || "",
      p: payload.obstetric?.p || "",
      l: payload.obstetric?.baby || "",
      lmp: payload.obstetric?.lmp || "",
      aog: payload.obstetric?.aog || "",
      edc: payload.obstetric?.edc || "",
      fht: payload.obstetric?.fht || "",
      ie: payload.obstetric?.ie || "",
      bow: positiveNegative(payload.obstetric?.bow),
    }],
    dispatchedTime: payload.dispatchTime || payload.timeline?.dispatchTime,
    dispatchTime: payload.dispatchTime || payload.timeline?.dispatchTime,
    arrivalScene: payload.arrivalScene || payload.timeline?.arrivalScene,
    departureScene: payload.departureScene || payload.timeline?.departureScene,
    arrivalHospital: payload.arrivalHospital || payload.timeline?.arrivalHospital,
    departureHospital: payload.departureHospital || payload.timeline?.departureHospital,
    arrivalOffice: payload.backToBase || payload.timeline?.backToBase,
    backToBase: payload.backToBase || payload.timeline?.backToBase,
    hospitalName: payload.hospitalName || payload.endorsementHospital,
    nameOfHospital: payload.hospitalName || payload.endorsementHospital,
    numberOfPatients: 1,
  };
}

async function ensureLocalManualPcrParent(payload) {
  if (payload.responseId && payload.dispatchId) return payload;
  const dispatch = await localServerClient.createDispatch(manualDispatchShellFromPcr(payload));
  await indexedDbRepository.createDispatch(dispatch, { source: RECORD_SOURCES.LOCAL_SERVER });
  return {
    ...payload,
    responseId: dispatch.responseId,
    responseClientId: dispatch.responseClientId || dispatch.responseId,
    dispatchId: dispatch.dispatchId || dispatch.id,
    dispatchClientId: dispatch.dispatchClientId || dispatch.dispatchId || dispatch.id,
    responseNumber: dispatch.responseNumber || payload.responseNumber,
    patientId: dispatch.patients?.[0]?.id || payload.patientId || null,
    dispatchPatientId: dispatch.patients?.[0]?.id || payload.dispatchPatientId || null,
    patients: dispatch.patients || payload.patients,
  };
}

export const hybridRepository = {
  async createIncident(payload) {
    const mode = await currentMode();
    if (mode === "cloud") return cloudClient.createIncident(payload);
    if (mode === "local") {
      try {
        const record = await localServerClient.createIncident(payload);
        return localNotice(record, "Saved to local ALERT-CIA server. Pending cloud synchronization.");
      } catch {
        return indexedDbRepository.createIncident(payload);
      }
    }
    return indexedDbRepository.createIncident(payload);
  },

  async createDispatch(payload) {
    const mode = await currentMode();
    if (mode === "cloud") {
      const record = await cloudClient.createDispatch(payload);
      await mirrorDispatchToLocalServer(record).catch(() => null);
      return record;
    }
    if (mode === "local") {
      try {
        const record = await localServerClient.createDispatch(payload);
        await indexedDbRepository.createDispatch(record, { source: RECORD_SOURCES.LOCAL_SERVER });
        return localNotice(record, "Dispatch saved to local ALERT-CIA server. Pending cloud synchronization.");
      } catch {
        return indexedDbRepository.createDispatch(payload);
      }
    }
    return indexedDbRepository.createDispatch(payload);
  },

  async updateDispatch(id, payload) {
    const mode = await currentMode();
    if (mode === "cloud") {
      const record = await cloudClient.updateDispatch(id, payload);
      await mirrorDispatchToLocalServer(record).catch(() => null);
      return record;
    }
    if (mode === "local") {
      try {
        const record = await localServerClient.updateDispatch(id, payload);
        await indexedDbRepository.updateDispatch(record.id || id, record);
        return localNotice(record, "Dispatch updated on local ALERT-CIA server. Pending cloud synchronization.");
      } catch {
        return indexedDbRepository.updateDispatch(id, payload);
      }
    }
    return indexedDbRepository.updateDispatch(id, payload);
  },

  async sendDispatch(id) {
    const mode = await currentMode();
    if (mode === "cloud") {
      const cloudRecord = await cloudClient.sendDispatch(id);
      if (getConnectionState().localOnline) {
        try {
          const localRecord = await mirrorDispatchToLocalServer(cloudRecord);
          const sentLocalRecord = await localServerClient.sendDispatch(localRecord?.dispatchId || localRecord?.id || cloudRecord.dispatchId || cloudRecord.id);
          await indexedDbRepository.sendDispatch(sentLocalRecord.id || sentLocalRecord.dispatchId || id, sentLocalRecord);
          return localNotice({ ...cloudRecord, localDispatch: sentLocalRecord }, "Dispatch sent to cloud and local LAN server.");
        } catch {
          await indexedDbRepository.sendDispatch(cloudRecord.dispatchId || cloudRecord.id || id, cloudRecord).catch(() => null);
        }
      }
      return cloudRecord;
    }
    if (mode === "local") {
      try {
        assertCanSendDispatch(await localServerClient.getDispatch(id).catch(() => null));
        const record = await localServerClient.sendDispatch(id);
        await indexedDbRepository.sendDispatch(record.id || id, record);
        return localNotice(record, "Assigned locally. Waiting for officer acknowledgement.");
      } catch (error) {
        if (error.message?.includes("completed PCR")) throw error;
        const localRecord = await indexedDbRepository.getLocalDispatchRecord(id);
        assertCanSendDispatch(localRecord);
        return indexedDbRepository.sendDispatch(id);
      }
    }
    const localRecord = await indexedDbRepository.getLocalDispatchRecord(id);
    assertCanSendDispatch(localRecord);
    return indexedDbRepository.sendDispatch(id);
  },

  async acknowledgeDispatch(id) {
    const mode = await currentMode();
    if (mode === "local") {
      try {
        return localServerClient.acknowledgeDispatch(id);
      } catch {
        return indexedDbRepository.acknowledgeDispatch(id);
      }
    }
    return indexedDbRepository.acknowledgeDispatch(id);
  },

  async savePcrDraft(payload) {
    const mode = await currentMode();
    if (mode === "cloud") return cloudClient.savePcrDraft(payload);
    if (mode === "local") {
      try {
        const parentedPayload = await ensureLocalManualPcrParent(payload);
        const record = await localServerClient.savePcrDraft(parentedPayload);
        await indexedDbRepository.savePcrDraft(record);
        return localNotice(record, "PCR draft saved to local server and this device.");
      } catch {
        return indexedDbRepository.savePcrDraft(payload);
      }
    }
    return indexedDbRepository.savePcrDraft(payload);
  },

  async submitPcr(payload) {
    const mode = await currentMode();
    if (mode === "cloud") return cloudClient.submitPcr(payload);
    if (mode === "local") {
      try {
        const parentedPayload = await ensureLocalManualPcrParent(payload);
        const result = await localServerClient.submitPcr(parentedPayload);
        const record = result.pcr || result;
        await indexedDbRepository.submitPcr(record);
        if (result.dispatch?.id) await indexedDbRepository.cacheCompletedDispatch(result.dispatch);
        return localNotice(record, "PCR submitted locally and returned to dispatcher. Pending cloud synchronization.");
      } catch {
        return indexedDbRepository.submitPcr(payload);
      }
    }
    return indexedDbRepository.submitPcr(payload);
  },

  markPcrCompletedByResponse: indexedDbRepository.markPcrCompletedByResponse,
  cacheAcceptedDispatch: indexedDbRepository.cacheAcceptedDispatch,
  cacheCompletedDispatch: indexedDbRepository.cacheCompletedDispatch,
  getLocalPcrReport: indexedDbRepository.getLocalPcrReport,
  getLocalPcrReports: indexedDbRepository.getLocalPcrReports,
  getLocalDispatchRecord: indexedDbRepository.getLocalDispatchRecord,
  getLocalDispatchRecords: indexedDbRepository.getLocalDispatchRecords,
  getPendingOperations: indexedDbRepository.getPendingOperations,
  reconcileCloudDispatches: indexedDbRepository.reconcileCloudDispatches,
  reconcileCloudPcrReports: indexedDbRepository.reconcileCloudPcrReports,
};
