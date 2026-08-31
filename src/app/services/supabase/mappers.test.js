import test from "node:test";
import assert from "node:assert/strict";

import { createPCR } from "../../utils/pcrStorage.js";
import { pcrPayloadFromRecord, pcrToApp } from "./mappers.js";

test("round-trips standalone PCR extended form sections through notes", () => {
  const record = {
    ...createPCR(),
    id: "11111111-1111-4111-8111-111111111111",
    responseId: "22222222-2222-4222-8222-222222222222",
    responseNumber: "PCR-2026-000001",
    respondingTeam: "Alpha",
    vehicle: "Ambulance 1",
    driver: "Driver One",
    mainAider: "Aider One",
    natureOfCall: "Emergency",
    patientName: "Juan Dela Cruz",
    age: "34",
    birthday: "1992-01-02",
    gender: "Male",
    civilStatus: "Single",
    address: "San Fabian, Echague",
    contactPerson: "Maria",
    contactNumber: "09171234567",
    dateOfIncident: "2026-08-31",
    timeOfIncident: "10:30",
    placeOfIncident: "Maharlika Highway",
    barangay: "San Fabian",
    latitude: "16.700000",
    longitude: "121.650000",
    boundarySource: "gps",
    triage: "Red",
    emergencyTypes: ["Medical"],
    chiefComplaint: "Chest pain",
    vitals: [{ id: "vital-1", time: "10:35", bp: "120/80", pulse: "80", respiratory: "18", temperature: "36.7", oxygen: "98" }],
    gcsRows: [{ id: "gcs-1", time: "10:36", eye: "4", verbal: "5", motor: "6" }],
    bodyMap: { image: "", marks: [{ type: "pen", points: [{ x: 12, y: 24 }] }] },
    airway: ["Open Airway"],
    breathing: ["O2 Given"],
    oxygenLpm: "2",
    pulseFindings: ["Strong"],
    pupils: ["Equal"],
    skin: ["Warm"],
    allergies: { status: "With Allergies", food: "Shrimp", drug: "", other: "" },
    medicalHistory: ["Hypertension"],
    hospitalization: { status: "Yes", date: "2026-01-01", where: "Clinic", reason: "Checkup" },
    smoking: { status: "No", sticks: "", stopped: "" },
    alcohol: { status: "No", frequency: "" },
    interventions: { "Oxygen inhalation": "Yes" },
    interventionDetails: { "Oxygen inhalation": "Nasal cannula" },
    signatures: { patient: "data:image/png;base64,test" },
    signatureNames: { patient: "Juan Dela Cruz" },
    signatureDates: { patient: "2026-08-31T10:45" },
    notes: "operator note",
  };

  const payload = pcrPayloadFromRecord(record);
  const hydrated = pcrToApp({
    id: record.id,
    client_generated_id: record.id,
    response_id: record.responseId,
    status: "draft",
    notes: payload.notes,
  });

  assert.equal(hydrated.patientName, record.patientName);
  assert.equal(hydrated.boundarySource, "gps");
  assert.deepEqual(hydrated.allergies, record.allergies);
  assert.deepEqual(hydrated.hospitalization, record.hospitalization);
  assert.deepEqual(hydrated.medicalHistory, record.medicalHistory);
  assert.deepEqual(hydrated.gcsRows, record.gcsRows);
  assert.deepEqual(hydrated.bodyMap, record.bodyMap);
  assert.deepEqual(hydrated.airway, record.airway);
  assert.deepEqual(hydrated.breathing, record.breathing);
  assert.deepEqual(hydrated.interventions, record.interventions);
  assert.deepEqual(hydrated.interventionDetails, record.interventionDetails);
  assert.deepEqual(hydrated.signatures, record.signatures);
  assert.deepEqual(hydrated.signatureNames, record.signatureNames);
  assert.deepEqual(hydrated.signatureDates, record.signatureDates);
});
