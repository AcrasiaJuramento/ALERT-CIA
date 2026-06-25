const DISPATCH_STATUS_TO_DB = {
  Draft: "draft",
  Dispatched: "dispatched",
  "Sent to Responding Team": "sent_to_responding_team",
  "Accepted by Responding Team": "accepted_by_responding_team",
  "PCR In Progress": "pcr_in_progress",
  "PCR Completed": "pcr_completed",
  Cancelled: "cancelled",
};

const DISPATCH_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(DISPATCH_STATUS_TO_DB).map(([label, value]) => [value, label])
);

const PCR_STATUS_TO_DB = {
  Draft: "draft",
  "In Progress": "in_progress",
  Submitted: "submitted",
  Verified: "verified",
  Rejected: "rejected",
  Completed: "completed",
};

const PCR_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(PCR_STATUS_TO_DB).map(([label, value]) => [value, label])
);

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

export function responseToApp(response = {}) {
  const barangayName = response.barangay?.name || response.barangays?.name || response.barangay_name || "";
  const teamName = response.responding_team?.name || response.responding_teams?.name || response.responding_team_name || "";
  const unitName = response.assigned_unit?.call_sign || response.ambulance_units?.call_sign || response.assigned_unit_name || "";

  return {
    id: response.id,
    responseNumber: response.response_number,
    dateOfIncident: response.date_of_incident || "",
    timeOfIncident: response.time_of_incident || "",
    placeOfIncident: response.place_of_incident || "",
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
  return {
    ...response,
    dispatchId: row.id || response.dispatchId,
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
    notes: row.notes || "",
    status: fromDbDispatchStatus(row.status || row.response?.status || row.responses?.status),
    sentAt: row.sent_at || "",
    patients: (row.dispatch_patients || []).map(patient => ({
      id: patient.id,
      name: patient.patient_name || "",
      age: patient.age ?? "",
      birthdate: patient.birthday || "",
      gender: patient.sex || "",
      address: patient.address || "",
      assessmentFindings: patient.assessment_findings || "",
      order: patient.patient_order,
    })),
  };
}

export function pcrToApp(row = {}) {
  const response = responseToApp(row.response || row.responses || row);
  return {
    ...response,
    id: row.id,
    pcrId: row.id,
    responseId: row.response_id || response.id,
    status: fromDbPCRStatus(row.status),
    triage: row.triage || "",
    chiefComplaint: row.chief_complaint || response.chiefComplaint || "",
    emergencyTypes: row.emergency_types || [],
    traumaTypes: row.trauma_types || [],
    incidentNature: row.incident_nature || "",
    hospitalName: row.hospital_name || "",
    residentOnDuty: row.resident_on_duty || "",
    endorsedTo: row.endorsed_to || "",
    receivedBy: row.received_by || "",
    transferReason: row.transfer_reason || "",
    notes: row.notes || "",
    backToBase: row.back_to_base_time || "",
    completedAt: row.completed_at || "",
    submittedAt: row.submitted_at || "",
    vitals: (row.pcr_vital_signs || []).map(vital => ({
      id: vital.id,
      time: vital.measured_time || "",
      bp: vital.blood_pressure || "",
      pulse: vital.pulse_rate || "",
      respiratory: vital.respiratory_rate || "",
      temperature: vital.temperature || "",
      oxygen: vital.oxygen_saturation || "",
    })),
    medications: (row.pcr_medications || []).map(medication => ({
      id: medication.id,
      drug: medication.drug || "",
      dose: medication.dose || "",
      dateTime: medication.given_at || "",
    })),
    interventionsList: row.pcr_interventions || [],
  };
}

export function responsePayloadFromDispatch(form = {}, ids = {}) {
  const firstPatient = form.patients?.[0] || {};
  return {
    date_of_incident: form.dateOfIncident || form.date || null,
    time_of_incident: form.timeOfIncident || null,
    place_of_incident: form.placeOfIncident || null,
    barangay_id: ids.barangayId || form.barangayId || null,
    type_of_incident: form.typeOfIncident || [...(form.natureTypes || []), form.otherMedical, form.otherTrauma].filter(Boolean).join(", ") || null,
    caller_name: form.callerName || null,
    caller_contact: form.callerContact || null,
    caller_address: form.callerAddress || null,
    patient_name: firstPatient.name || form.patientName || null,
    patient_age: firstPatient.age ? Number(firstPatient.age) : form.age ? Number(form.age) : null,
    patient_birthday: firstPatient.birthdate || form.birthday || null,
    patient_sex: firstPatient.gender || form.gender || null,
    patient_address: firstPatient.address || form.address || null,
    initial_assessment: firstPatient.assessmentFindings || form.chiefComplaint || null,
    responding_team_id: ids.teamId || form.respondingTeamId || null,
    assigned_unit_id: ids.unitId || form.vehicleId || null,
    driver_name: form.driver || null,
    main_aider_name: form.mainAider || form.fieldOfficer || form.groupLeader || null,
    assistant_aider_name: form.assistantAider || null,
    status: toDbDispatchStatus(form.status),
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
    notes: form.notes || null,
    status: toDbDispatchStatus(form.status),
  };
}

export function pcrPayloadFromRecord(record = {}) {
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
    notes: record.notes || null,
    back_to_base_time: record.backToBase || null,
  };
}
