import {
  createDispatchRecord,
  markResponseBackToBase,
  sendDispatchToRespondingTeam,
  updateDispatchRecord,
} from "../services/supabase/dispatchService";
import { createIncident } from "../services/supabase/incidentService";
import { replacePCRAttachments, replacePCRInterventions, replacePCRMedications, replacePCRVitals, upsertPCRReport } from "../services/supabase/pcrService";
import { randomUuid } from "../utils/uuid";

async function replacePCRChildRows(pcrId, payload) {
  await Promise.all([
    replacePCRVitals(pcrId, payload.vitals || []),
    replacePCRMedications(pcrId, payload.medications || []),
    replacePCRInterventions(pcrId, payload.interventions || {}, payload.interventionDetails || {}),
    replacePCRAttachments(pcrId, payload.attachments || []),
  ]);
}

function manualDispatchShellFromPcr(payload) {
  return {
    id: payload.dispatchId || payload.dispatchClientId || randomUuid(),
    dispatchId: payload.dispatchId || payload.dispatchClientId || undefined,
    dispatchClientId: payload.dispatchClientId || payload.dispatchId || undefined,
    responseId: payload.responseId || payload.responseClientId || randomUuid(),
    responseClientId: payload.responseClientId || payload.responseId || undefined,
    responseNumber: payload.responseNumber,
    status: payload.status === "Draft" ? "PCR In Progress" : "Submitted",
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
    mainAider: payload.mainAider || payload.fieldOfficer,
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
    patients: [{
      id: payload.patientId || payload.dispatchPatientId || undefined,
      patientClientId: payload.patientId || payload.dispatchPatientId || undefined,
      name: payload.patientName,
      age: payload.age,
      birthdate: payload.birthday,
      gender: payload.gender,
      address: payload.address,
      assessmentFindings: payload.chiefComplaint,
    }],
    dispatchedTime: payload.dispatchTime || payload.timeline?.dispatchTime,
    arrivalScene: payload.arrivalScene || payload.timeline?.arrivalScene,
    departureScene: payload.departureScene || payload.timeline?.departureScene,
    arrivalHospital: payload.arrivalHospital || payload.timeline?.arrivalHospital,
    departureHospital: payload.departureHospital || payload.timeline?.departureHospital,
    backToBase: payload.backToBase || payload.timeline?.backToBase,
    numberOfPatients: 1,
  };
}

async function ensureManualPcrParent(payload) {
  if (payload.workflowOrigin === "reverse" && payload.responseId) return payload;
  if (payload.responseId && payload.dispatchId) return payload;
  const dispatch = await createDispatchRecord(manualDispatchShellFromPcr(payload));
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

export const cloudClient = {
  createIncident,
  createDispatch: createDispatchRecord,
  updateDispatch: updateDispatchRecord,
  sendDispatch: sendDispatchToRespondingTeam,
  markResponseBackToBase,
  async savePcrDraft(payload) {
    const parentedPayload = await ensureManualPcrParent(payload);
    const saved = await upsertPCRReport(parentedPayload);
    await replacePCRChildRows(saved.id, payload);
    return saved;
  },
  async submitPcr(payload) {
    const parentedPayload = await ensureManualPcrParent(payload);
    const saved = await upsertPCRReport(parentedPayload, { submit: true });
    await replacePCRChildRows(saved.id, payload);
    return saved;
  },
  async submitPcrHeader(payload) {
    const parentedPayload = await ensureManualPcrParent(payload);
    return upsertPCRReport(parentedPayload, { submit: true });
  },
};
