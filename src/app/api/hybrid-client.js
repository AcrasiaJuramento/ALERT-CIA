import { cloudClient } from "./cloud-client";
import { indexedDbRepository } from "../db/repositories/indexed-db-repository";
import { getConnectionState, checkConnection } from "../network/connection-manager";

function internetRequired(action = "complete this action") {
  throw new Error(`Internet connection is required to ${action}.`);
}

async function currentMode() {
  const state = getConnectionState();
  if (!state.lastCheckedAt) return (await checkConnection({ force: true })).mode;
  return state.mode;
}

function isStandalonePcr(payload = {}) {
  return payload.workflowOrigin === "reverse"
    || payload.offlineStandalone === true
    || (!payload.dispatchId && !payload.dispatchClientId && !payload.responseId && !payload.responseClientId);
}

function standaloneNotice(record, message) {
  return {
    ...record,
    workflowOrigin: "reverse",
    offlineStandalone: true,
    hybridMessage: message,
  };
}

export const hybridRepository = {
  async createIncident(payload) {
    if (await currentMode() === "cloud") return cloudClient.createIncident(payload);
    return internetRequired("create an incident");
  },

  async createDispatch(payload) {
    if (await currentMode() === "cloud") return cloudClient.createDispatch(payload);
    return internetRequired("create a dispatch form");
  },

  async updateDispatch(id, payload) {
    if (await currentMode() === "cloud") return cloudClient.updateDispatch(id, payload);
    return internetRequired("update a dispatch form");
  },

  async sendDispatch(id) {
    if (await currentMode() === "cloud") return cloudClient.sendDispatch(id);
    return internetRequired("send a dispatch form");
  },

  async acknowledgeDispatch() {
    return internetRequired("accept a dispatch");
  },

  async savePcrDraft(payload) {
    if (await currentMode() === "cloud") return cloudClient.savePcrDraft(payload);
    if (!isStandalonePcr(payload)) return internetRequired("save this PCR");
    const record = await indexedDbRepository.savePcrDraft({
      ...payload,
      workflowOrigin: "reverse",
      offlineStandalone: true,
    });
    return standaloneNotice(record, "Standalone PCR draft saved on this device. It will sync when internet returns.");
  },

  async submitPcr(payload) {
    if (await currentMode() === "cloud") return cloudClient.submitPcr(payload);
    if (!isStandalonePcr(payload)) return internetRequired("submit this PCR");
    const record = await indexedDbRepository.submitPcr({
      ...payload,
      workflowOrigin: "reverse",
      offlineStandalone: true,
    });
    return standaloneNotice(record, "Standalone PCR saved on this device. It will submit when internet returns.");
  },

  getLocalPcrReport: indexedDbRepository.getLocalPcrReport,
  getLocalPcrReports: indexedDbRepository.getLocalPcrReports,
  getLocalDispatchRecord: indexedDbRepository.getLocalDispatchRecord,
  getLocalDispatchRecords: indexedDbRepository.getLocalDispatchRecords,
  getPendingOperations: indexedDbRepository.getPendingOperations,
  reconcileCloudDispatches: indexedDbRepository.reconcileCloudDispatches,
  reconcileCloudPcrReports: indexedDbRepository.reconcileCloudPcrReports,
};
