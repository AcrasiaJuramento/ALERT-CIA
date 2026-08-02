const DISPATCH_STATUS_TO_DB = {
  Draft: "draft",
  Dispatched: "dispatched",
  "Sent to Field Officer": "sent_to_responding_team",
  "Sent to Responding Team": "sent_to_responding_team",
  "Accepted by Responding Team": "accepted_by_responding_team",
  "PCR In Progress": "pcr_in_progress",
  "PCR Completed": "pcr_completed",
  Submitted: "pcr_completed",
  "Submitted Locally": "pcr_completed",
  Verified: "completed",
  Cancelled: "cancelled",
};

const DISPATCH_STATUS_FROM_DB = {
  draft: "Draft",
  dispatched: "Dispatched",
  sent_to_responding_team: "Sent to Responding Team",
  accepted_by_responding_team: "Accepted by Responding Team",
  pcr_in_progress: "PCR In Progress",
  pcr_completed: "Submitted",
  completed: "Verified",
  cancelled: "Cancelled",
};

const PCR_STATUS_TO_DB = {
  Draft: "draft",
  "In Progress": "in_progress",
  Submitted: "submitted",
  "Submitted Locally": "submitted",
  Verified: "verified",
  Rejected: "rejected",
  Completed: "submitted",
};

const PCR_STATUS_FROM_DB = {
  draft: "Draft",
  in_progress: "In Progress",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  completed: "Submitted",
};

const ECHAGUE_COORDINATE_BOUNDS = {
  southWest: [16.60, 121.54],
  northEast: [16.82, 121.80],
  padding: 0.1,
};

export function toDbDispatchStatus(status = "Draft") {
  return DISPATCH_STATUS_TO_DB[status] || status || "draft";
}

export function fromDbDispatchStatus(status = "draft") {
  return DISPATCH_STATUS_FROM_DB[status] || status || "Draft";
}

export function toDbPCRStatus(status = "In Progress") {
  return PCR_STATUS_TO_DB[status] || status || "in_progress";
}

export function fromDbPCRStatus(status = "in_progress") {
  return PCR_STATUS_FROM_DB[status] || status || "In Progress";
}

export function normalizeName(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function numericCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function patientBirthdayFromRecord(record = {}) {
  return normalizedDate(
    record.birthdate
    || record.birthday
    || record.patientBirthday
    || record.patient_birthday
    || record.dateOfBirth
  );
}

export function isValidIncidentCoordinate(latitude, longitude) {
  const lat = numericCoordinate(latitude);
  const lng = numericCoordinate(longitude);
  if (lat === null || lng === null) return false;
  const { southWest, northEast, padding } = ECHAGUE_COORDINATE_BOUNDS;
  return lat >= southWest[0] - padding
    && lat <= northEast[0] + padding
    && lng >= southWest[1] - padding
    && lng <= northEast[1] + padding;
}

function locationGeographyFromCoordinates(latitude, longitude) {
  const lat = numericCoordinate(latitude);
  const lng = numericCoordinate(longitude);
  return !isValidIncidentCoordinate(lat, lng)
    ? null
    : `SRID=4326;POINT(${lng.toFixed(7)} ${lat.toFixed(7)})`;
}

const NOTES_EXTENDED_KEY = "__alertCiaExtended";

const DISPATCH_EXTENDED_FIELDS = [
  "groupLeader", "mainAider", "natureTypes", "otherMedical", "otherTrauma", "otherNature",
  "incidentNature", "assaultDetails", "animalBiteDetails", "ingestionItem", "ingestionQuantity",
  "ifIngestion", "ingestionDetails", "quantity", "ifFall", "fallDetails", "selfAccident",
  "collision", "vehicleInvolved", "vehicleInvolve", "crash", "assistanceNeeded",
  "patients",
];

const PCR_EXTENDED_FIELDS = [
  "respondingTeam", "vehicle", "driver", "mainAider", "groupLeader", "assistantAider",
  "natureOfCall", "dateOfIncident", "timeOfIncident", "placeOfIncident", "barangay",
  "locationText", "latitude", "longitude", "locationGeography", "dispatchTime", "arrivalScene",
  "departureScene", "arrivalHospital", "departureHospital", "backToBase", "timeline",
  "patientName", "age", "birthday", "gender", "civilStatus", "address", "contactPerson",
  "contactNumber", "emergencyOther", "assaultDetails", "animalBiteDetails", "ingestionItem",
  "ingestionQuantity", "fallDetails", "obstetric", "crash", "gcs", "gcsRows", "bodyMap",
  "suspectedSpinal", "airway", "breathing", "oxygenLpm", "oxygenVia", "pulseFindings",
  "bleeding", "bleedingLocation", "bleedingControlled", "capillary", "pupils", "skin",
  "painPositive", "painScore", "painOnset", "painQuality", "painOther", "allergies",
  "medicalHistory", "medicalHistoryOther", "hospitalization", "oralIntake",
  "oralIntakeDateTime", "smoking", "alcohol", "eventsPrior", "interventions",
  "interventionDetails", "hospitalDate", "hospitalTime", "consentForCare",
  "endorsementHospital", "endorsementDate", "endorsementTime", "transferArrivalTime",
  "receiverName", "receiverPosition", "receiverContact", "receiverConfirmed",
  "departureHospitalGeneratedAt", "valuables", "valuablesReceivedBy", "valuablesContact",
  "waiverAccepted", "waiverReason", "signatures", "signatureNames", "signatureDates",
  "annotation", "attachments",
];

function isMeaningful(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(isMeaningful);
  return true;
}

function pickMeaningful(source = {}, keys = []) {
  return keys.reduce((picked, key) => {
    if (isMeaningful(source[key])) picked[key] = source[key];
    return picked;
  }, {});
}

function parseNotesBlob(notes) {
  if (!notes) return { text: "", extended: {} };
  if (typeof notes === "object") {
    return {
      text: notes.text || "",
      extended: notes[NOTES_EXTENDED_KEY] || notes.extended || {},
    };
  }
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object" && (parsed[NOTES_EXTENDED_KEY] || parsed.extended || "text" in parsed)) {
      return {
        text: parsed.text || "",
        extended: parsed[NOTES_EXTENDED_KEY] || parsed.extended || {},
      };
    }
  } catch {
    // Existing records may store plain operator notes.
  }
  return { text: String(notes), extended: {} };
}

function buildNotesBlob(notes, extended) {
  const text = typeof notes === "string" ? notes : notes?.text || "";
  const previous = parseNotesBlob(notes);
  const mergedExtended = { ...previous.extended, ...extended };
  if (!Object.keys(mergedExtended).length) return text || null;
  return JSON.stringify({ text, [NOTES_EXTENDED_KEY]: mergedExtended });
}

export function responseLocationPayloadFromRecord(record = {}) {
  const rawLatitude = numericCoordinate(record.latitude ?? record.lat);
  const rawLongitude = numericCoordinate(record.longitude ?? record.lng ?? record.lon);
  const hasValidCoordinates = isValidIncidentCoordinate(rawLatitude, rawLongitude);
  const latitude = hasValidCoordinates ? rawLatitude : null;
  const longitude = hasValidCoordinates ? rawLongitude : null;
  const locationText = record.locationText || record.placeOfIncident || record.timeline?.placeOfIncident || null;

  return {
    place_of_incident: record.placeOfIncident || record.timeline?.placeOfIncident || locationText,
    location_text: locationText,
    latitude,
    longitude,
    location_geography: hasValidCoordinates && typeof record.locationGeography === "string"
      ? record.locationGeography
      : locationGeographyFromCoordinates(latitude, longitude),
  };
}

export function responseToApp(response = {}) {
  const barangayName = response.barangay?.name || response.barangays?.name || response.barangay_name || "";
  const teamName = response.responding_team?.name || response.responding_teams?.name || response.responding_team_name || "";
  const unitName = response.assigned_unit?.call_sign || response.ambulance_units?.call_sign || response.assigned_unit_name || "";
  const locationText = response.location_text || response.place_of_incident || "";

  return {
    id: response.id,
    responseClientId: response.client_generated_id || response.id,
    responseNumber: response.response_number,
    dateOfIncident: response.date_of_incident || "",
    timeOfIncident: response.time_of_incident || "",
    placeOfIncident: locationText,
    locationText,
    latitude: response.latitude ?? "",
    longitude: response.longitude ?? "",
    locationGeography: response.location_geography || "",
    barangayId: response.barangay_id || null,
    barangay: barangayName,
    typeOfIncident: response.type_of_incident || "",
    callerName: response.caller_name || "",
    callerContact: response.caller_contact || "",
    callerAddress: response.caller_address || "",
    patientName: response.patient_name || "",
    age: response.patient_age ?? "",
    birthday: response.patient_birthday || "",
    gender: response.patient_sex || "",
    address: response.patient_address || "",
    chiefComplaint: response.initial_assessment || "",
    respondingTeamId: response.responding_team_id || null,
    team: teamName,
    vehicleId: response.assigned_unit_id || null,
    vehicle: unitName,
    driver: response.driver_name || "",
    mainAider: response.main_aider_name || "",
    assistantAider: response.assistant_aider_name || "",
    status: fromDbDispatchStatus(response.status),
    acceptedAt: response.accepted_at || "",
    resolvedAt: response.resolved_at || "",
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

export function dispatchToApp(row = {}) {
  const response = responseToApp(row.response || row.responses || row);
  const notesBlob = parseNotesBlob(row.notes);
  const extendedPatients = notesBlob.extended.patients || [];
  return {
    ...response,
    ...notesBlob.extended,
    dispatchId: row.id || response.dispatchId,
    dispatchClientId: row.client_generated_id || row.id || response.dispatchId,
    id: row.id || response.id,
    responseId: row.response_id || response.id,
    dispatchedTime: row.dispatch_time || "",
    arrivalScene: row.arrival_scene_time || "",
    departureScene: row.departure_scene_time || "",
    arrivalHospital: row.arrival_hospital_time || "",
    departureHospital: row.departure_hospital_time || "",
    backToBase: row.arrival_office_time || "",
    hospitalName: row.hospital_name || "",
    numberOfPatients: row.number_of_patients || 1,
    assistanceNeeded: row.assistance_needed || [],
    notes: notesBlob.text,
    status: fromDbDispatchStatus(row.status || row.response?.status || row.responses?.status),
    sentAt: row.sent_at || "",
    patients: (row.dispatch_patients || []).length ? (row.dispatch_patients || []).map((patient, index) => ({
      ...(extendedPatients[index] || {}),
      id: patient.id,
      patientClientId: patient.client_generated_id || patient.id,
      name: patient.patient_name || extendedPatients[index]?.name || "",
      age: patient.age ?? extendedPatients[index]?.age ?? "",
      birthdate: patient.birthday || extendedPatients[index]?.birthdate || "",
      gender: patient.sex || extendedPatients[index]?.gender || "",
      address: patient.address || extendedPatients[index]?.address || "",
      assessmentFindings: patient.assessment_findings || extendedPatients[index]?.assessmentFindings || "",
      order: patient.patient_order,
    })) : extendedPatients,
  };
}

export function pcrToApp(row = {}) {
  const response = responseToApp(row.response || row.responses || row);
  const notesBlob = parseNotesBlob(row.notes);
  const extended = notesBlob.extended;
  const vitalRows = (row.pcr_vital_signs || []).map(vital => ({
    id: vital.id,
    time: vital.measured_time || "",
    bp: vital.blood_pressure || "",
    pulse: vital.pulse_rate || "",
    respiratory: vital.respiratory_rate || "",
    temperature: vital.temperature || "",
    oxygen: vital.oxygen_saturation || "",
  }));
  const medicationRows = (row.pcr_medications || []).map(medication => ({
    id: medication.id,
    drug: medication.drug || "",
    dose: medication.dose || "",
    dateTime: medication.given_at || "",
  }));
  const interventionRows = row.pcr_interventions || [];
  const attachmentRows = (row.pcr_attachments || []).map(attachment => ({
    id: attachment.metadata?.id || attachment.id,
    name: attachment.file_name || "",
    type: attachment.attachment_type || "document",
    size: attachment.metadata?.size || "",
    location: attachment.metadata?.location || null,
    capturedAt: attachment.metadata?.capturedAt || attachment.created_at || "",
    storagePath: attachment.storage_path || "",
    data: attachment.metadata?.data || "",
  }));
  return {
    ...response,
    ...extended,
    id: row.id,
    pcrId: row.id,
    pcrClientId: row.client_generated_id || row.id,
    responseId: row.response_id || response.id,
    dispatchId: row.dispatch_form_id || row.dispatch?.id || row.dispatch_forms?.id || response.dispatchId || null,
    dispatchPatientId: row.dispatch_patient_id || null,
    respondingTeamId: row.responding_team_id || response.respondingTeamId || null,
    respondingTeam: response.team || row.responding_team?.name || extended.respondingTeam || "",
    fieldOfficerId: row.field_officer_id || row.created_by || null,
    status: fromDbPCRStatus(row.status),
    triage: row.triage || extended.triage || "",
    chiefComplaint: row.chief_complaint || response.chiefComplaint || extended.chiefComplaint || "",
    emergencyTypes: row.emergency_types?.length ? row.emergency_types : extended.emergencyTypes || [],
    traumaTypes: row.trauma_types?.length ? row.trauma_types : extended.traumaTypes || [],
    incidentNature: row.incident_nature || extended.incidentNature || "",
    hospitalName: row.hospital_name || extended.hospitalName || "",
    residentOnDuty: row.resident_on_duty || extended.residentOnDuty || "",
    endorsedTo: row.endorsed_to || extended.endorsedTo || "",
    receivedBy: row.received_by || extended.receivedBy || "",
    transferReason: row.transfer_reason || extended.transferReason || "",
    notes: notesBlob.text,
    backToBase: row.back_to_base_time || extended.backToBase || "",
    completedAt: row.completed_at || "",
    submittedAt: row.submitted_at || "",
    vitals: vitalRows.length ? vitalRows : extended.vitals || [],
    medications: medicationRows.length ? medicationRows : extended.medications || [],
    interventions: Object.keys(extended.interventions || {}).length
      ? extended.interventions
      : Object.fromEntries(interventionRows.map(intervention => [intervention.intervention_name, intervention.result])),
    interventionDetails: Object.keys(extended.interventionDetails || {}).length
      ? extended.interventionDetails
      : Object.fromEntries(interventionRows.filter(intervention => intervention.notes).map(intervention => [intervention.intervention_name, intervention.notes])),
    attachments: attachmentRows.length ? attachmentRows : extended.attachments || [],
    interventionsList: interventionRows,
  };
}

export function responsePayloadFromDispatch(form = {}, ids = {}) {
  const firstPatient = form.patients?.[0] || {};
  const patientBirthday = patientBirthdayFromRecord(firstPatient) || patientBirthdayFromRecord(form);
  const patientAge = firstPatient.age ?? form.age;
  const patientAgeNumber = patientAge !== null && patientAge !== undefined && String(patientAge).trim() !== "" && /^\d{1,3}$/.test(String(patientAge).trim())
    ? Number(patientAge)
    : null;
  return {
    date_of_incident: form.dateOfIncident || form.date || null,
    time_of_incident: form.timeOfIncident || null,
    ...responseLocationPayloadFromRecord(form),
    barangay_id: ids.barangayId || form.barangayId || null,
    type_of_incident: form.typeOfIncident || [...(form.natureTypes || []), form.otherMedical, form.otherTrauma].filter(Boolean).join(", ") || null,
    caller_name: form.callerName || null,
    caller_contact: form.callerContact || null,
    caller_address: form.callerAddress || null,
    patient_name: firstPatient.name || form.patientName || null,
    patient_age: patientAgeNumber,
    patient_birthday: patientBirthday,
    patient_sex: firstPatient.gender || form.gender || null,
    patient_address: firstPatient.address || form.address || null,
    initial_assessment: firstPatient.assessmentFindings || form.chiefComplaint || null,
    responding_team_id: form.respondingTeamId || ids.teamId || null,
    assigned_unit_id: ids.unitId || form.vehicleId || null,
    driver_name: form.driver || null,
    main_aider_name: form.mainAider || form.fieldOfficer || form.groupLeader || null,
    assistant_aider_name: form.assistantAider || null,
    status: toDbDispatchStatus(form.status),
    client_generated_id: form.responseClientId || form.responseId || null,
  };
}

export function dispatchPayloadFromForm(form = {}) {
  return {
    dispatch_time: form.dispatchedTime || form.dispatchTime || null,
    arrival_scene_time: form.arrivalScene || null,
    departure_scene_time: form.departureScene || null,
    arrival_hospital_time: form.arrivalHospital || null,
    departure_hospital_time: form.departureHospital || null,
    arrival_office_time: form.backToBase || null,
    hospital_name: form.hospitalName || null,
    number_of_patients: Number(form.numberOfPatients || form.patients?.length || 1),
    assistance_needed: form.assistanceNeeded || [],
    notes: buildNotesBlob(form.notes, pickMeaningful(form, DISPATCH_EXTENDED_FIELDS)),
    status: toDbDispatchStatus(form.status),
    client_generated_id: form.dispatchClientId || form.dispatchId || form.id || null,
  };
}

export function pcrPayloadFromRecord(record = {}) {
  const timeline = record.timeline || {};
  const patientBirthday = patientBirthdayFromRecord(record);
  return {
    status: toDbPCRStatus(record.status),
    triage: record.triage || null,
    chief_complaint: record.chiefComplaint || null,
    emergency_types: record.emergencyTypes || [],
    trauma_types: record.traumaTypes || [],
    incident_nature: record.incidentNature || null,
    hospital_name: record.hospitalName || null,
    resident_on_duty: record.residentOnDuty || null,
    endorsed_to: record.endorsedTo || null,
    received_by: record.receivedBy || null,
    transfer_reason: record.transferReason || null,
    notes: buildNotesBlob(record.notes, pickMeaningful({ ...record, birthday: patientBirthday || record.birthday }, PCR_EXTENDED_FIELDS)),
    back_to_base_time: record.backToBase || timeline.backToBase || null,
    client_generated_id: record.pcrClientId || record.pcrId || record.id || null,
    dispatch_patient_id: record.dispatchPatientId || record.patientId || null,
  };
}
