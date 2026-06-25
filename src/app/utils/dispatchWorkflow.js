export const DISPATCH_STORAGE_KEY = "dispatches";
export const INCIDENT_STORAGE_KEY = "alert-cia-incident-records";
export const DISPATCH_EDIT_KEY = "alert-cia-dispatch-edit-id";
const PCR_STORAGE_KEY = "alert-cia-pcr-records";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

const newVital = () => ({ id: newId(), time: "", bp: "", pulse: "", respiratory: "", temperature: "", oxygen: "" });

function newPCRTemplate() {
  return {
    status: "Draft",
    archived: false,
    respondingTeam: "",
    vehicle: "",
    driver: "",
    mainAider: "",
    assistantAider: "",
    natureOfCall: "Emergency",
    dateOfIncident: "",
    timeOfIncident: "",
    placeOfIncident: "",
    dispatchTime: "",
    arrivalScene: "",
    departureScene: "",
    arrivalHospital: "",
    departureHospital: "",
    backToBase: "",
    timeline: {
      dateOfIncident: "",
      timeOfIncident: "",
      placeOfIncident: "",
      dispatchTime: "",
      arrivalScene: "",
      departureScene: "",
      endorsementTime: "",
      arrivalHospital: "",
      departureHospital: "",
      backToBase: "",
    },
    patientName: "",
    age: "",
    birthday: "",
    gender: "",
    civilStatus: "",
    address: "",
    contactPerson: "",
    contactNumber: "",
    triage: "",
    emergencyTypes: [],
    traumaTypes: [],
    emergencyOther: "",
    assaultDetails: "",
    animalBiteDetails: "",
    incidentNature: "",
    ingestionItem: "",
    ingestionQuantity: "",
    fallDetails: "",
    obstetric: { lmp: "", g: "", p: "", edc: "", bow: "", aog: "", baby: "", ie: "", placenta: "" },
    crash: { selfAccident: false, collision: false, vehicle: "", role: "", plate: "", alcohol: "", helmet: "", license: "" },
    chiefComplaint: "",
    vitals: [newVital()],
    gcs: { eye: "", verbal: "", motor: "" },
    bodyMap: { image: "", marks: [] },
    suspectedSpinal: "",
    airway: [],
    breathing: [],
    oxygenLpm: "",
    oxygenVia: "",
    pulseFindings: [],
    bleeding: "",
    bleedingLocation: "",
    bleedingControlled: "",
    capillary: "",
    pupils: [],
    skin: [],
    painPositive: "",
    painScore: "",
    painOnset: "",
    painQuality: [],
    painOther: "",
    allergies: { status: "", food: "", drug: "", other: "" },
    medications: [{ drug: "", dose: "", dateTime: "" }],
    medicalHistory: [],
    medicalHistoryOther: "",
    hospitalization: { status: "", date: "", where: "", reason: "" },
    oralIntake: "",
    oralIntakeDateTime: "",
    smoking: { status: "", sticks: "", stopped: "" },
    alcohol: { status: "", frequency: "" },
    eventsPrior: "",
    interventions: {},
    interventionDetails: {},
    hospitalName: "",
    transferReason: "",
    residentOnDuty: "",
    hospitalDate: "",
    hospitalTime: "",
    consentForCare: "",
    endorsedTo: "",
    receivedBy: "",
    endorsementHospital: "",
    endorsementDate: "",
    endorsementTime: "",
    transferArrivalTime: "",
    receiverName: "",
    receiverPosition: "",
    receiverContact: "",
    receiverConfirmed: false,
    departureHospitalGeneratedAt: "",
    valuables: "",
    valuablesReceivedBy: "",
    valuablesContact: "",
    waiverAccepted: false,
    waiverReason: "",
    signatures: { consent: "", patient: "", witness1: "", witness2: "", resident: "", receiver: "" },
    signatureNames: { consent: "", patient: "", witness1: "", witness2: "", resident: "", receiver: "" },
    signatureDates: { patient: "", witness1: "", witness2: "" },
    annotation: "",
    attachments: [],
    notes: "",
  };
}

function normalizePCRRecord(record = {}) {
  const base = newPCRTemplate();
  return {
    ...base,
    ...record,
    timeline: { ...base.timeline, ...(record.timeline || {}) },
    obstetric: { ...base.obstetric, ...(record.obstetric || {}) },
    crash: { ...base.crash, ...(record.crash || {}) },
    gcs: { ...base.gcs, ...(record.gcs || {}) },
    bodyMap: { ...base.bodyMap, ...(record.bodyMap || {}), marks: record.bodyMap?.marks || base.bodyMap.marks },
    allergies: { ...base.allergies, ...(record.allergies || {}) },
    hospitalization: { ...base.hospitalization, ...(record.hospitalization || {}) },
    smoking: { ...base.smoking, ...(record.smoking || {}) },
    alcohol: { ...base.alcohol, ...(record.alcohol || {}) },
    signatures: { ...base.signatures, ...(record.signatures || {}) },
    signatureNames: { ...base.signatureNames, ...(record.signatureNames || {}) },
    signatureDates: { ...base.signatureDates, ...(record.signatureDates || {}) },
    vitals: record.vitals?.length ? record.vitals : base.vitals,
    emergencyTypes: record.emergencyTypes || base.emergencyTypes,
    traumaTypes: record.traumaTypes || base.traumaTypes,
    airway: record.airway || base.airway,
    breathing: record.breathing || base.breathing,
    pulseFindings: record.pulseFindings || base.pulseFindings,
    pupils: record.pupils || base.pupils,
    skin: record.skin || base.skin,
    painQuality: record.painQuality || base.painQuality,
    medications: record.medications?.length ? record.medications : base.medications,
    medicalHistory: record.medicalHistory || base.medicalHistory,
    interventions: record.interventions || base.interventions,
    interventionDetails: record.interventionDetails || base.interventionDetails,
    attachments: record.attachments || base.attachments,
  };
}

export const RESPONDING_TEAMS = [
  "Alpha Run 1", "Alpha Run 2", "Alpha Run 3", "Alpha Run 4", "Alpha Run 5", "Alpha Run 6", "Alpha Run 7", "Alpha Run 8",
  "Bravo Run 1", "Bravo Run 2", "Bravo Run 3", "Bravo Run 4", "Bravo Run 5", "Bravo Run 6", "Bravo Run 7", "Bravo Run 8",
  "Charlie Run 1", "Charlie Run 2", "Charlie Run 3", "Charlie Run 4", "Charlie Run 5", "Charlie Run 6", "Charlie Run 7", "Charlie Run 8",
];

export const DISPATCH_STATUSES = {
  DRAFT: "Draft",
  DISPATCHED: "Dispatched",
  SENT: "Sent to Responding Team",
  ACCEPTED: "Accepted by Responding Team",
  PCR_IN_PROGRESS: "PCR In Progress",
  PCR_COMPLETED: "PCR Completed",
};

export function loadDispatchRecords() {
  try {
    return JSON.parse(localStorage.getItem(DISPATCH_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function setDispatchRecords(records) {
  localStorage.setItem(DISPATCH_STORAGE_KEY, JSON.stringify(records));
}

export function loadIncidentRecords() {
  try {
    return JSON.parse(localStorage.getItem(INCIDENT_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function setIncidentRecords(records) {
  localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(records));
}

function loadPCRRecords() {
  try {
    return JSON.parse(localStorage.getItem(PCR_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setPCRRecords(records) {
  localStorage.setItem(PCR_STORAGE_KEY, JSON.stringify(records));
}

export function generateResponseNumber() {
  const year = new Date().getFullYear();
  const usedNumbers = [
    ...loadDispatchRecords().map(item => item.responseNumber),
    ...loadIncidentRecords().map(item => item.incidentNumber),
    ...loadPCRRecords().map(item => item.responseNumber),
  ].filter(Boolean);
  const maxSequence = usedNumbers.reduce((max, number) => {
    const match = String(number).match(/^RESP-\d{4}-(\d{4})$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `RESP-${year}-${String(maxSequence + 1).padStart(4, "0")}`;
}

function ensureResponseNumber(form = {}) {
  return form.responseNumber || generateResponseNumber();
}

const PCR_MEDICAL_TYPES = ["Medical", "Pediatric", "Psychiatric", "Surgical", "Obstetrical", "Drowning"];
const PCR_TRAUMA_TYPES = ["Trauma", "Fall", "Electrocution", "Domestic Violence", "Water Rescue Incident", "Fire Incident", "Assault", "Animal Bite", "Motor Vehicle Crash"];

function incidentTypeParts(incident = {}) {
  return [
    ...(incident.natureTypes || []),
    incident.otherMedical,
    incident.otherTrauma,
  ].filter(Boolean).flatMap(item => String(item).split(",").map(part => part.trim()).filter(Boolean));
}

function pcrIncidentTypePatch(incident = {}) {
  const types = incidentTypeParts(incident);
  const emergencyTypes = types.filter(type => PCR_MEDICAL_TYPES.includes(type));
  const traumaTypes = types.filter(type => PCR_TRAUMA_TYPES.includes(type));
  const conductionTypes = ["Conduction", "Transport", "Transfer"];
  return {
    natureOfCall: types.some(type => conductionTypes.includes(type)) ? "Conduction" : "Emergency",
    emergencyTypes,
    traumaTypes,
    emergencyOther: incident.otherMedical || "",
    assaultDetails: incident.assaultDetails || "",
    animalBiteDetails: incident.animalBiteDetails || "",
    incidentNature: incident.incidentNature || "",
    ingestionItem: incident.ifIngestion || "",
    ingestionQuantity: incident.quantity || "",
    fallDetails: incident.ifFall || "",
    crash: {
      selfAccident: Boolean(incident.selfAccident),
      collision: Boolean(incident.collision),
      vehicle: incident.vehicleInvolved || "",
      role: "",
      plate: "",
      alcohol: "",
      helmet: "",
      license: "",
    },
  };
}

export function dispatchTypeLabel(form = {}) {
  return [
    ...(form.natureTypes || []),
    form.otherMedical,
    form.otherTrauma,
  ].filter(Boolean).join(", ");
}

export function deriveIncidentFromDispatch(form = {}) {
  const firstPatient = form.patients?.[0] || {};
  const responseNumber = ensureResponseNumber(form);
  return {
    id: form.incidentId || newId(),
    incidentNumber: responseNumber,
    responseNumber,
    dateOfIncident: form.dateOfIncident || form.date || "",
    timeOfIncident: form.timeOfIncident || "",
    placeOfIncident: form.placeOfIncident || "",
    barangay: form.barangay || "",
    typeOfIncident: dispatchTypeLabel(form),
    natureTypes: form.natureTypes || [],
    assaultDetails: form.assaultDetails || "",
    animalBiteDetails: form.animalBiteDetails || "",
    otherMedical: form.otherMedical || "",
    otherTrauma: form.otherTrauma || "",
    incidentNature: form.incidentNature || "",
    ifIngestion: form.ifIngestion || "",
    quantity: form.quantity || "",
    ifFall: form.ifFall || "",
    selfAccident: Boolean(form.selfAccident),
    collision: Boolean(form.collision),
    vehicleInvolved: form.vehicleInvolved || "",
    callerName: form.callerName || "",
    callerContact: form.callerContact || "",
    patientName: firstPatient.name || "",
    age: firstPatient.age || "",
    birthday: firstPatient.birthdate || "",
    gender: firstPatient.gender || "",
    address: firstPatient.address || "",
    chiefComplaint: firstPatient.assessmentFindings || "",
    dispatchTime: form.dispatchedTime || "",
    arrivalScene: form.arrivalScene || "",
    respondingTeam: form.team || "",
    assignedUnit: form.vehicle || "",
    driver: form.driver || "",
    assignedGroupLeader: form.groupLeader || "",
    assignedFieldOfficer: form.fieldOfficer || form.groupLeader || "",
    assistantAider: form.assistantAider || "",
    status: form.status || DISPATCH_STATUSES.DRAFT,
    dispatchId: form.id,
    pcrId: form.pcrId || null,
    createdByDispatcherId: form.dispatcher || "",
    acceptedByTeamId: form.acceptedByTeamId || "",
    acceptedAt: form.acceptedAt || "",
    updatedAt: nowIso(),
  };
}

export function applyIncidentToDispatch(form = {}, incident = {}) {
  const firstPatient = form.patients?.[0] || {};
  const patients = form.patients?.length ? [...form.patients] : [{ id: newId() }];
  patients[0] = {
    ...firstPatient,
    name: incident.patientName ?? firstPatient.name ?? "",
    age: incident.age ?? firstPatient.age ?? "",
    birthdate: incident.birthday ?? firstPatient.birthdate ?? "",
    gender: incident.gender ?? firstPatient.gender ?? "",
    address: incident.address ?? firstPatient.address ?? "",
    assessmentFindings: incident.chiefComplaint ?? firstPatient.assessmentFindings ?? "",
  };

  return {
    ...form,
    incidentId: incident.id || form.incidentId,
    pcrId: incident.pcrId || form.pcrId || null,
    responseNumber: incident.incidentNumber || form.responseNumber || "",
    dateOfIncident: incident.dateOfIncident || form.dateOfIncident || "",
    timeOfIncident: incident.timeOfIncident || form.timeOfIncident || "",
    placeOfIncident: incident.placeOfIncident || form.placeOfIncident || "",
    barangay: incident.barangay || form.barangay || "",
    callerName: incident.callerName || form.callerName || "",
    callerContact: incident.callerContact || form.callerContact || "",
    dispatchedTime: incident.dispatchTime || form.dispatchedTime || "",
    arrivalScene: incident.arrivalScene || form.arrivalScene || "",
    team: incident.respondingTeam || form.team || "",
    vehicle: incident.assignedUnit || form.vehicle || "",
    driver: incident.driver || form.driver || "",
    groupLeader: incident.assignedGroupLeader || form.groupLeader || "",
    fieldOfficer: incident.assignedFieldOfficer || form.fieldOfficer || "",
    assistantAider: incident.assistantAider || form.assistantAider || "",
    status: incident.status || form.status || DISPATCH_STATUSES.DRAFT,
    patients,
  };
}

export function pcrPatchFromIncident(incident = {}) {
  const typePatch = pcrIncidentTypePatch(incident);
  return {
    incidentId: incident.id,
    dispatchId: incident.dispatchId || null,
    responseNumber: incident.incidentNumber || "",
    dateOfIncident: incident.dateOfIncident || "",
    timeOfIncident: incident.timeOfIncident || "",
    placeOfIncident: incident.placeOfIncident || "",
    dispatchTime: incident.dispatchTime || "",
    arrivalScene: incident.arrivalScene || "",
    respondingTeam: incident.respondingTeam || "",
    vehicle: incident.assignedUnit || "",
    driver: incident.driver || "",
    mainAider: incident.assignedFieldOfficer || incident.assignedGroupLeader || "",
    assistantAider: incident.assistantAider || "",
    patientName: incident.patientName || "",
    age: incident.age || "",
    birthday: incident.birthday || "",
    gender: incident.gender || "",
    address: incident.address || "",
    contactPerson: incident.callerName || "",
    contactNumber: incident.callerContact || "",
    chiefComplaint: incident.chiefComplaint || "",
    ...typePatch,
    timeline: {
      dateOfIncident: incident.dateOfIncident || "",
      timeOfIncident: incident.timeOfIncident || "",
      placeOfIncident: incident.placeOfIncident || "",
      dispatchTime: incident.dispatchTime || "",
      arrivalScene: incident.arrivalScene || "",
    },
  };
}

export function saveIncidentRecord(incident) {
  const records = loadIncidentRecords();
  const index = records.findIndex(item => item.id === incident.id);
  const next = { ...incident, updatedAt: nowIso() };
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.unshift({ ...next, createdAt: nowIso() });
  setIncidentRecords(records);
  return index >= 0 ? { ...records[index] } : { ...records[0] };
}

export function saveDispatchForm(form) {
  const formWithNumber = { ...form, responseNumber: ensureResponseNumber(form) };
  const baseIncident = deriveIncidentFromDispatch(formWithNumber);
  const incident = saveIncidentRecord(baseIncident);
  const nextForm = {
    ...applyIncidentToDispatch(formWithNumber, incident),
    status: form.status || incident.status || DISPATCH_STATUSES.DRAFT,
    updatedAt: nowIso(),
  };
  const records = loadDispatchRecords();
  const index = records.findIndex(item => item.id === nextForm.id);
  if (index >= 0) records[index] = nextForm;
  else records.unshift({ ...nextForm, createdAt: nextForm.createdAt || nowIso() });
  setDispatchRecords(records);

  const pcrs = loadPCRRecords();
  const pcrIndex = pcrs.findIndex(item => item.id === nextForm.pcrId || item.dispatchId === nextForm.id || item.incidentId === nextForm.incidentId);
  if (pcrIndex >= 0) {
    const patch = pcrPatchFromIncident(incident);
    pcrs[pcrIndex] = normalizePCRRecord({
      ...pcrs[pcrIndex],
      ...patch,
      updatedAt: nowIso(),
      timeline: { ...(pcrs[pcrIndex].timeline || {}), ...(patch.timeline || {}) },
    });
    setPCRRecords(pcrs);
  }

  return nextForm;
}

export function sendDispatchToRespondingTeam(form) {
  const savedDispatch = saveDispatchForm({
    ...form,
    status: DISPATCH_STATUSES.SENT,
    sentToRespondingTeamAt: nowIso(),
  });
  const incident = saveIncidentRecord({
    ...deriveIncidentFromDispatch(savedDispatch),
    id: savedDispatch.incidentId,
    status: DISPATCH_STATUSES.SENT,
  });
  const finalDispatch = saveDispatchForm({ ...savedDispatch, incidentId: incident.id, status: DISPATCH_STATUSES.SENT });
  return { dispatch: finalDispatch, incident };
}

export const sendDispatchToFieldOfficer = sendDispatchToRespondingTeam;

export function acceptDispatch(form, teamId = form.team || "") {
  const acceptedDispatch = saveDispatchForm({
    ...form,
    status: DISPATCH_STATUSES.ACCEPTED,
    acceptedByTeamId: teamId,
    acceptedAt: nowIso(),
  });
  const incident = saveIncidentRecord({
    ...deriveIncidentFromDispatch(acceptedDispatch),
    id: acceptedDispatch.incidentId,
    status: DISPATCH_STATUSES.ACCEPTED,
    acceptedByTeamId: teamId,
    acceptedAt: acceptedDispatch.acceptedAt,
  });

  const pcrs = loadPCRRecords();
  const existingIndex = pcrs.findIndex(item => item.incidentId === incident.id || item.dispatchId === acceptedDispatch.id || item.id === acceptedDispatch.pcrId);
  const existing = existingIndex >= 0 ? pcrs[existingIndex] : {};
  const pcrId = existing.id || newId();
  const pcrPatch = pcrPatchFromIncident({ ...incident, pcrId });
  const nextPCR = normalizePCRRecord({
    ...existing,
    ...pcrPatch,
    id: pcrId,
    dispatchId: acceptedDispatch.id,
    status: existing.status && existing.status !== "Draft" ? existing.status : "In Progress",
    archived: existing.archived || false,
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso(),
    timeline: { ...(existing.timeline || {}), ...(pcrPatch.timeline || {}) },
  });
  if (existingIndex >= 0) pcrs[existingIndex] = nextPCR;
  else pcrs.unshift(nextPCR);
  setPCRRecords(pcrs);

  const linkedIncident = saveIncidentRecord({
    ...incident,
    pcrId,
    status: nextPCR.status === "Completed" || nextPCR.status === "Verified" ? DISPATCH_STATUSES.PCR_COMPLETED : DISPATCH_STATUSES.PCR_IN_PROGRESS,
  });
  const finalDispatch = saveDispatchForm({ ...acceptedDispatch, pcrId, incidentId: linkedIncident.id, status: linkedIncident.status });
  return { dispatch: finalDispatch, pcr: nextPCR, incident: linkedIncident };
}

export function markDispatchBackToBase(form) {
  const backToBaseTime = new Date().toTimeString().slice(0, 5);
  const completedAt = nowIso();
  const pcrs = loadPCRRecords();
  const pcrIndex = pcrs.findIndex(item => item.id === form?.pcrId || item.dispatchId === form?.id || item.incidentId === form?.incidentId);

  if (pcrIndex < 0) {
    throw new Error("No linked PCR report found for this dispatch.");
  }

  const currentPCR = normalizePCRRecord(pcrs[pcrIndex]);
  const nextPCR = normalizePCRRecord({
    ...currentPCR,
    backToBase: backToBaseTime,
    completedAt,
    status: "Completed",
    updatedAt: completedAt,
    timeline: {
      ...(currentPCR.timeline || {}),
      backToBase: backToBaseTime,
    },
  });
  pcrs[pcrIndex] = nextPCR;
  setPCRRecords(pcrs);

  const incident = saveIncidentRecord({
    ...deriveIncidentFromDispatch(form),
    id: form.incidentId,
    pcrId: nextPCR.id,
    status: DISPATCH_STATUSES.PCR_COMPLETED,
  });

  const dispatches = loadDispatchRecords();
  const nextDispatch = {
    ...applyIncidentToDispatch({ ...form, pcrId: nextPCR.id }, incident),
    status: DISPATCH_STATUSES.PCR_COMPLETED,
    backToBase: backToBaseTime,
    resolvedAt: completedAt,
    updatedAt: completedAt,
  };
  setDispatchRecords(dispatches.map(item => item.id === nextDispatch.id ? nextDispatch : item));

  return { dispatch: nextDispatch, pcr: nextPCR, incident };
}

export function syncIncidentFromPCR(record = {}) {
  if (!record.incidentId && !record.dispatchId) return record;

  const incidents = loadIncidentRecords();
  const incident = incidents.find(item => item.id === record.incidentId || item.dispatchId === record.dispatchId) || {
    id: record.incidentId || newId(),
    dispatchId: record.dispatchId || null,
  };
  const nextIncident = saveIncidentRecord({
    ...incident,
    pcrId: record.id,
    incidentNumber: record.responseNumber || incident.incidentNumber || "",
    dateOfIncident: record.dateOfIncident || record.timeline?.dateOfIncident || incident.dateOfIncident || "",
    timeOfIncident: record.timeOfIncident || record.timeline?.timeOfIncident || incident.timeOfIncident || "",
    placeOfIncident: record.placeOfIncident || record.timeline?.placeOfIncident || incident.placeOfIncident || "",
    dispatchTime: record.dispatchTime || record.timeline?.dispatchTime || incident.dispatchTime || "",
    arrivalScene: record.arrivalScene || record.timeline?.arrivalScene || incident.arrivalScene || "",
    patientName: record.patientName || incident.patientName || "",
    age: record.age || incident.age || "",
    birthday: record.birthday || incident.birthday || "",
    gender: record.gender || incident.gender || "",
    address: record.address || incident.address || "",
    chiefComplaint: record.chiefComplaint || incident.chiefComplaint || "",
    callerName: record.contactPerson || incident.callerName || "",
    callerContact: record.contactNumber || incident.callerContact || "",
    respondingTeam: record.respondingTeam || incident.respondingTeam || "",
    assignedUnit: record.vehicle || incident.assignedUnit || "",
    driver: record.driver || incident.driver || "",
    natureTypes: [...(record.emergencyTypes || []), ...(record.traumaTypes || [])],
    assignedFieldOfficer: record.mainAider || incident.assignedFieldOfficer || "",
    assistantAider: record.assistantAider || incident.assistantAider || "",
    incidentNature: record.incidentNature || incident.incidentNature || "",
    assaultDetails: record.assaultDetails || incident.assaultDetails || "",
    animalBiteDetails: record.animalBiteDetails || incident.animalBiteDetails || "",
    ifIngestion: record.ingestionItem || incident.ifIngestion || "",
    quantity: record.ingestionQuantity || incident.quantity || "",
    ifFall: record.fallDetails || incident.ifFall || "",
    selfAccident: record.crash?.selfAccident ?? incident.selfAccident ?? false,
    collision: record.crash?.collision ?? incident.collision ?? false,
    vehicleInvolved: record.crash?.vehicle || incident.vehicleInvolved || "",
    status: record.status === "Submitted" || record.status === "In Progress" ? DISPATCH_STATUSES.PCR_IN_PROGRESS : record.status === "Verified" || record.status === "Completed" ? DISPATCH_STATUSES.PCR_COMPLETED : incident.status || DISPATCH_STATUSES.PCR_IN_PROGRESS,
  });

  if (nextIncident.dispatchId) {
    const dispatches = loadDispatchRecords();
    setDispatchRecords(dispatches.map(item => item.id === nextIncident.dispatchId ? applyIncidentToDispatch({ ...item, pcrId: record.id }, nextIncident) : item));
  }

  return { ...record, incidentId: nextIncident.id, dispatchId: nextIncident.dispatchId || record.dispatchId };
}

export function findLinkedPCR(dispatchRecord) {
  const pcrs = loadPCRRecords();
  return pcrs.find(item => item.id === dispatchRecord?.pcrId || item.dispatchId === dispatchRecord?.id || item.incidentId === dispatchRecord?.incidentId) || null;
}
