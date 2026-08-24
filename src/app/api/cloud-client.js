import {
  createDispatchRecord,
  markResponseBackToBase,
  sendDispatchToRespondingTeam,
  updateDispatchRecord,
} from "../services/supabase/dispatchService";
import { createIncident } from "../services/supabase/incidentService";
import { replacePCRAttachments, replacePCRInterventions, replacePCRMedications, replacePCRVitals, upsertPCRReport } from "../services/supabase/pcrService";
import { randomUuid } from "../utils/uuid";

function hasMeaningfulVitalRows(vitals = []) {
  return vitals.some(vital => vital?.time || vital?.bp || vital?.pulse || vital?.respiratory || vital?.temperature || vital?.oxygen);
}

function hasMeaningfulMedicationRows(medications = []) {
  return medications.some(medication => medication?.drug || medication?.dose || medication?.dateTime);
}

function hasMeaningfulInterventions(interventions = {}) {
  return Object.values(interventions || {}).some(Boolean);
}

function hasMeaningfulAttachments(attachments = []) {
  return attachments.some(attachment => attachment?.name || attachment?.fileName || attachment?.data || attachment?.storagePath);
}

async function replacePCRChildRows(pcrId, payload) {
  const replacements = [];
  if (hasMeaningfulVitalRows(payload.vitals || [])) replacements.push(replacePCRVitals(pcrId, payload.vitals));
  if (hasMeaningfulMedicationRows(payload.medications || [])) replacements.push(replacePCRMedications(pcrId, payload.medications));
  if (hasMeaningfulInterventions(payload.interventions || {})) replacements.push(replacePCRInterventions(pcrId, payload.interventions, payload.interventionDetails || {}));
  if (hasMeaningfulAttachments(payload.attachments || [])) replacements.push(replacePCRAttachments(pcrId, payload.attachments));
  await Promise.all(replacements);
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
