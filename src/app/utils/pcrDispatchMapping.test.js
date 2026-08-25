import test from "node:test";
import assert from "node:assert/strict";

import { mergePcrSources, pcrSeedFromDispatch } from "./pcrDispatchMapping.js";
import { createPCR, synchronizePCR } from "./pcrStorage.js";
import { firstRecordIdentifier, normalizeRecordIdentifier } from "./uuid.js";

test("maps a received dispatch into the linked PCR shape used by the Expo workflow", () => {
  const dispatch = {
    id: "dispatch-1",
    responseId: "response-1",
    responseNumber: "RESP-2026-001",
    respondingTeamId: "team-1",
    team: "Alpha Team",
    vehicleId: "unit-1",
    vehicle: "Ambulance 1",
    driver: "Driver One",
    mainAider: "Aider One",
    groupLeader: "Leader One",
    assistantAider: "Aider Two",
    natureTypes: ["Medical", "Motor Vehicle Crash"],
    otherMedical: "Possible ingestion",
    dateOfIncident: "2026-08-25",
    timeOfIncident: "09:15:00",
    placeOfIncident: "Maharlika Highway",
    barangay: "San Fabian",
    latitude: 16.7,
    longitude: 121.65,
    dispatchTime: "09:20:00",
    arrivalScene: "09:32:00",
    patients: [{
      id: "patient-1",
      name: "Patient One",
      age: 31,
      birthdate: "1995-04-03",
      gender: "Female",
      civilStatus: "Single",
      address: "San Fabian, Echague",
      assessmentFindings: "Chest pain",
      bp: "120/80",
      pr: "84",
      rr: "18",
      temp: "36.8",
      o2Sat: "98",
      driver: true,
      helmet: "+",
      alcoholBreath: "-",
      driversLicense: "+",
      g: "2",
      p: "1",
      lmp: "2026-01-01",
      bow: "+",
      placenta: "Intact",
    }],
    callerName: "Caller One",
    callerContact: "09171234567",
    vehicleInvolved: "Private Vehicle",
    plateNumber: "ABC-1234",
    nameOfHospital: "Echague District Hospital",
  };
  const shell = { id: "pcr-1", pcrId: "pcr-1", responseId: "response-1", status: "In Progress" };

  const record = mergePcrSources(pcrSeedFromDispatch(dispatch, shell, createPCR()), shell);

  assert.equal(record.id, "pcr-1");
  assert.equal(record.dispatchId, "dispatch-1");
  assert.equal(record.responseNumber, "RESP-2026-001");
  assert.equal(record.respondingTeam, "Alpha Team");
  assert.equal(record.vehicle, "Ambulance 1");
  assert.equal(record.driver, "Driver One");
  assert.equal(record.mainAider, "Aider One");
  assert.equal(record.groupLeader, "Leader One");
  assert.equal(record.assistantAider, "Aider Two");
  assert.equal(record.patientName, "Patient One");
  assert.equal(record.birthday, "1995-04-03");
  assert.equal(record.birthYear, "1995");
  assert.equal(record.civilStatus, "Single");
  assert.equal(record.contactPerson, "Caller One");
  assert.equal(record.chiefComplaint, "Chest pain");
  assert.deepEqual(record.emergencyTypes, ["Medical"]);
  assert.deepEqual(record.traumaTypes, ["Trauma", "Motor Vehicle Crash"]);
  assert.equal(record.timeline.dispatchTime, "09:20");
  assert.equal(record.timeline.arrivalScene, "09:32");
  assert.equal(record.vitals[0].bp, "120/80");
  assert.equal(record.obstetric.bow, "Positive");
  assert.equal(record.obstetric.placenta, "Intact");
  assert.equal(record.crash.role, "Driver");
  assert.equal(record.crash.plate, "ABC-1234");
  assert.equal(record.crash.alcohol, "Negative");
  assert.equal(record.endorsementHospital, "Echague District Hospital");
});

test("keeps dispatch seeds when an accepted PCR shell contains empty placeholders", () => {
  const seed = { responseNumber: "RESP-1", patientName: "Patient", timeline: { dispatchTime: "08:00", arrivalScene: "08:15" } };
  const shell = { responseNumber: "", patientName: "", timeline: { dispatchTime: "", arrivalScene: "08:17" } };

  assert.deepEqual(mergePcrSources(seed, shell), {
    responseNumber: "RESP-1",
    patientName: "Patient",
    timeline: { dispatchTime: "08:00", arrivalScene: "08:17" },
  });
});

test("rejects serialized null identifiers and preserves the linked dispatch identifiers", () => {
  const seed = { dispatchId: "dispatch-1", responseId: "response-1" };
  const staleDraft = { dispatchId: "undefined", responseId: "null" };

  assert.deepEqual(mergePcrSources(seed, staleDraft), seed);
  assert.equal(normalizeRecordIdentifier(" undefined "), "");
  assert.equal(firstRecordIdentifier("null", "response-1"), "response-1");
});

test("normalizes nested PCR values without collapsing distinct hospital timeline events", () => {
  const record = synchronizePCR({
    emergencyTypes: null,
    traumaTypes: "Medical",
    arrivalHospital: "10:00:00",
    endorsementTime: "10:12:00",
    hospitalTime: "10:05:00",
    painScore: 15,
    gcsRows: [
      { id: "gcs-1", time: "09:30", eye: "4", verbal: "4", motor: "5" },
      { id: "gcs-2", time: "09:45", eye: "4", verbal: "5", motor: "6" },
    ],
  });

  assert.deepEqual(record.emergencyTypes, []);
  assert.deepEqual(record.traumaTypes, []);
  assert.equal(record.arrivalHospital, "10:00");
  assert.equal(record.hospitalTime, "10:05");
  assert.equal(record.endorsementTime, "10:12");
  assert.equal(record.timeline.endorsementTime, "10:12");
  assert.equal(record.painScore, "10");
  assert.equal(record.gcs.eye, "4");
  assert.equal(record.gcs.verbal, "5");
  assert.equal(record.gcs.motor, "6");
});
