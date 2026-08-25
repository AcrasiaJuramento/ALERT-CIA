import {
  createDispatchRecord,
  markResponseBackToBase,
  sendDispatchToRespondingTeam,
  updateDispatchRecord,
} from "../services/supabase/dispatchService";
import { createIncident } from "../services/supabase/incidentService";
import { getPCRReport, replacePCRAttachments, replacePCRInterventions, replacePCRMedications, replacePCRVitals, upsertPCRReport } from "../services/supabase/pcrService";
import { firstRecordIdentifier, isUuidIdentifier, randomUuid } from "../utils/uuid";

async function replacePCRChildRows(pcrId, payload) {
  await Promise.all([
    replacePCRVitals(pcrId, payload.vitals || []),
    replacePCRMedications(pcrId, payload.medications || []),
    replacePCRInterventions(pcrId, payload.interventions || {}, payload.interventionDetails || {}),
    replacePCRAttachments(pcrId, payload.attachments || []),
  ]);
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
  const vital = latestVital(payload);
  const vehicleRole = patientVehicleRole(payload.crash);
  return {
    id: firstRecordIdentifier(payload.dispatchId, payload.dispatchClientId) || randomUuid(),
    dispatchId: firstRecordIdentifier(payload.dispatchId, payload.dispatchClientId) || undefined,
    dispatchClientId: firstRecordIdentifier(payload.dispatchClientId, payload.dispatchId) || undefined,
    responseId: firstRecordIdentifier(payload.responseId, payload.responseClientId) || randomUuid(),
    responseClientId: firstRecordIdentifier(payload.responseClientId, payload.responseId) || undefined,
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
      id: payload.patientId || payload.dispatchPatientId || undefined,
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

async function ensureManualPcrParent(payload) {
  const responseId = firstRecordIdentifier(payload.responseId, payload.responseClientId);
  const dispatchId = firstRecordIdentifier(payload.dispatchId, payload.dispatchClientId);
  const normalizedPayload = {
    ...payload,
    responseId,
    responseClientId: firstRecordIdentifier(payload.responseClientId, responseId),
    dispatchId,
    dispatchClientId: firstRecordIdentifier(payload.dispatchClientId, dispatchId),
  };
  if (payload.workflowOrigin === "reverse" && isUuidIdentifier(responseId)) return normalizedPayload;
  // A dispatch-only link is recoverable by upsertPCRReport. Do not create a
  // second manual dispatch for a PCR that already belongs to one.
  if (dispatchId || responseId) return normalizedPayload;
  const dispatch = await createDispatchRecord(manualDispatchShellFromPcr(normalizedPayload));
  return {
    ...normalizedPayload,
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
    return getPCRReport(saved.id);
  },
  async submitPcr(payload) {
    const parentedPayload = await ensureManualPcrParent(payload);
    const saved = await upsertPCRReport(parentedPayload, { submit: true });
    await replacePCRChildRows(saved.id, payload);
    return getPCRReport(saved.id);
  },
  async submitPcrHeader(payload) {
    const parentedPayload = await ensureManualPcrParent(payload);
    return upsertPCRReport(parentedPayload, { submit: true });
  },
};
