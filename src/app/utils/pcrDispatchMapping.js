import { createPCR, normalizeTimeValue, synchronizePCR } from "./pcrStorage.js";
import { firstRecordIdentifier, normalizeRecordIdentifier } from "./uuid.js";

const DISPATCH_EMERGENCY_TYPES = ["Medical", "Pediatric", "Psychiatric", "Surgical", "Obstetrical", "Drowning"];
const DISPATCH_TRAUMA_TYPES = ["Trauma", "Fall", "Electrocution", "Domestic Violence", "Water Rescue Incident", "Fire Incident", "Assault", "Animal Bite", "Motor Vehicle Crash"];

function isMeaningful(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(isMeaningful);
  return true;
}

export function mergePcrSources(base = {}, override = {}) {
  const merged = { ...base };
  Object.entries(override || {}).forEach(([key, value]) => {
    if (["id", "pcrId", "pcrClientId", "dispatchId", "dispatchClientId", "responseId", "responseClientId"].includes(key) && !normalizeRecordIdentifier(value)) return;
    if (!isMeaningful(value)) return;
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && merged[key]
      && typeof merged[key] === "object"
      && !Array.isArray(merged[key])
    ) {
      merged[key] = mergePcrSources(merged[key], value);
    } else {
      merged[key] = value;
    }
  });
  return merged;
}

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "") ?? "";
}

function timelineTime(...values) {
  const value = firstValue(...values);
  return value ? normalizeTimeValue(value) : "";
}

function plusMinus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["+", "positive", "yes", "pos"].includes(normalized)) return "Positive";
  if (["-", "negative", "no", "neg"].includes(normalized)) return "Negative";
  return value || "";
}

function birthdateParts(value = "") {
  const [birthYear = "", birthMonth = "", birthDay = ""] = String(value || "").split("-");
  return { birthYear, birthMonth, birthDay };
}

function patientCrashRole(patient = {}) {
  return [
    patient.driver && "Driver",
    patient.passenger && "Passenger",
    patient.pedestrian && "Pedestrian",
  ].filter(Boolean).join(" / ");
}

function incidentTypes(dispatch = {}) {
  return Array.isArray(dispatch.natureTypes)
    ? dispatch.natureTypes
    : String(dispatch.typeOfIncident || "").split(",").map(item => item.trim()).filter(Boolean);
}

export function pcrSeedFromDispatch(dispatch = {}, pcrShell = {}, freshPcr = createPCR()) {
  const patients = Array.isArray(dispatch.patients) ? dispatch.patients : [];
  const patient = patients[0] || {};
  const birthday = firstValue(patient.birthdate, patient.birthday, dispatch.birthday);
  const selectedTypes = incidentTypes(dispatch);
  const emergencyTypes = DISPATCH_EMERGENCY_TYPES.filter(type => selectedTypes.includes(type));
  const traumaTypes = DISPATCH_TRAUMA_TYPES.filter(type => selectedTypes.includes(type));
  if (selectedTypes.some(type => DISPATCH_TRAUMA_TYPES.includes(type)) && !traumaTypes.includes("Trauma")) traumaTypes.unshift("Trauma");

  const dispatchTime = timelineTime(
    dispatch.dispatchTime,
    dispatch.dispatchedTime,
    dispatch.timeline?.dispatchTime,
    pcrShell.dispatchTime,
    pcrShell.timeline?.dispatchTime,
  );
  const arrivalScene = timelineTime(dispatch.arrivalScene, dispatch.arrivalAtScene, dispatch.timeline?.arrivalScene, pcrShell.arrivalScene, pcrShell.timeline?.arrivalScene);
  const departureScene = timelineTime(dispatch.departureScene, dispatch.departureAtScene, dispatch.timeline?.departureScene, pcrShell.departureScene, pcrShell.timeline?.departureScene);
  const arrivalHospital = timelineTime(dispatch.arrivalHospital, dispatch.arrivalAtHospital, dispatch.timeline?.arrivalHospital, pcrShell.arrivalHospital, pcrShell.timeline?.arrivalHospital);
  const departureHospital = timelineTime(dispatch.departureHospital, dispatch.departureAtHospital, dispatch.timeline?.departureHospital, pcrShell.departureHospital, pcrShell.timeline?.departureHospital);
  const backToBase = timelineTime(dispatch.backToBase, dispatch.arrivalOffice, dispatch.arrivalAtOffice, dispatch.timeline?.backToBase, pcrShell.backToBase, pcrShell.timeline?.backToBase);
  const incidentDate = firstValue(dispatch.dateOfIncident, dispatch.date, freshPcr.dateOfIncident);
  const incidentTime = firstValue(dispatch.timeOfIncident, freshPcr.timeOfIncident);
  const incidentPlace = firstValue(dispatch.placeOfIncident, dispatch.locationText, freshPcr.placeOfIncident);
  const pcrId = firstValue(pcrShell.id, pcrShell.pcrId, freshPcr.id);

  return synchronizePCR({
    ...freshPcr,
    id: pcrId,
    pcrId,
    dispatchId: firstRecordIdentifier(dispatch.dispatchId, dispatch.id, pcrShell.dispatchId),
    dispatchClientId: firstRecordIdentifier(dispatch.dispatchClientId, pcrShell.dispatchClientId, dispatch.dispatchId, dispatch.id),
    responseId: firstRecordIdentifier(dispatch.responseId, pcrShell.responseId),
    responseClientId: firstRecordIdentifier(dispatch.responseClientId, pcrShell.responseClientId, dispatch.responseId, pcrShell.responseId),
    responseNumber: firstValue(dispatch.responseNumber, pcrShell.responseNumber, freshPcr.responseNumber),
    patientId: firstValue(patient.id, patient.patientClientId, dispatch.patientId, pcrShell.patientId) || null,
    dispatchPatientId: firstValue(patient.id, dispatch.dispatchPatientId, pcrShell.dispatchPatientId) || null,
    patients,
    respondingTeam: firstValue(dispatch.respondingTeam, dispatch.team),
    respondingTeamId: firstValue(dispatch.respondingTeamId, pcrShell.respondingTeamId) || null,
    team: firstValue(dispatch.respondingTeam, dispatch.team),
    vehicle: firstValue(dispatch.vehicle, pcrShell.vehicle),
    vehicleId: firstValue(dispatch.vehicleId, pcrShell.vehicleId) || null,
    driver: firstValue(dispatch.driver, pcrShell.driver),
    mainAider: firstValue(dispatch.mainAider, dispatch.main_aider_name, pcrShell.mainAider),
    groupLeader: firstValue(dispatch.groupLeader, dispatch.group_leader, dispatch.groupLeaderName, pcrShell.groupLeader),
    assistantAider: firstValue(dispatch.assistantAider, dispatch.assistant_aider_name, pcrShell.assistantAider),
    natureOfCall: selectedTypes.includes("Conduction") ? "Conduction" : firstValue(dispatch.natureOfCall, "Emergency"),
    dateOfIncident: incidentDate,
    timeOfIncident: incidentTime,
    placeOfIncident: incidentPlace,
    locationText: firstValue(dispatch.locationText, incidentPlace),
    barangay: firstValue(dispatch.barangay, dispatch.barangayName, dispatch.location_barangay),
    barangayId: firstValue(dispatch.barangayId, pcrShell.barangayId) || null,
    latitude: dispatch.latitude ?? pcrShell.latitude ?? "",
    longitude: dispatch.longitude ?? pcrShell.longitude ?? "",
    locationGeography: firstValue(dispatch.locationGeography, pcrShell.locationGeography),
    boundarySource: firstValue(dispatch.boundarySource, pcrShell.boundarySource),
    dispatchTime,
    dispatchedTime: dispatchTime,
    arrivalScene,
    departureScene,
    arrivalHospital,
    departureHospital,
    backToBase,
    timeline: {
      dateOfIncident: incidentDate,
      timeOfIncident: incidentTime,
      placeOfIncident: incidentPlace,
      dispatchTime,
      arrivalScene,
      departureScene,
      arrivalHospital,
      departureHospital,
      backToBase,
    },
    patientName: firstValue(dispatch.patientName, patient.name),
    age: firstValue(dispatch.age, patient.age),
    birthday,
    ...birthdateParts(birthday),
    gender: firstValue(dispatch.gender, patient.gender),
    civilStatus: firstValue(dispatch.civilStatus, patient.civilStatus),
    address: firstValue(dispatch.address, patient.address),
    contactPerson: firstValue(dispatch.contactPerson, patient.contactPerson, dispatch.callerName),
    contactNumber: firstValue(dispatch.contactNumber, patient.contactNumber, dispatch.callerContact),
    chiefComplaint: firstValue(dispatch.chiefComplaint, patient.assessmentFindings, patient.assessment),
    vitals: [patient.bp, patient.pr, patient.rr, patient.temp, patient.o2Sat].some(isMeaningful)
      ? [{ id: freshPcr.vitals?.[0]?.id, time: "", bp: patient.bp || "", pulse: patient.pr || "", respiratory: patient.rr || "", temperature: patient.temp || "", oxygen: patient.o2Sat || "" }]
      : freshPcr.vitals,
    emergencyTypes,
    traumaTypes,
    emergencyOther: firstValue(dispatch.otherMedical, dispatch.otherTrauma, dispatch.otherNature),
    assaultDetails: dispatch.assaultDetails || "",
    animalBiteDetails: dispatch.animalBiteDetails || "",
    incidentNature: dispatch.incidentNature || "",
    ingestionItem: firstValue(dispatch.ingestionItem, dispatch.ifIngestion, dispatch.ingestionDetails),
    ingestionQuantity: firstValue(dispatch.ingestionQuantity, dispatch.quantity),
    fallDetails: firstValue(dispatch.fallDetails, dispatch.ifFall),
    obstetric: {
      ...freshPcr.obstetric,
      lmp: firstValue(patient.lmp, dispatch.obstetric?.lmp),
      g: firstValue(patient.g, dispatch.obstetric?.g),
      p: firstValue(patient.p, dispatch.obstetric?.p),
      t: firstValue(patient.t, dispatch.obstetric?.t),
      pa: firstValue(patient.pa, dispatch.obstetric?.pa),
      baby: firstValue(patient.baby, patient.l, dispatch.obstetric?.baby, dispatch.obstetric?.l),
      edc: firstValue(patient.edc, dispatch.obstetric?.edc),
      bow: plusMinus(firstValue(patient.bow, dispatch.obstetric?.bow)),
      aog: firstValue(patient.aog, dispatch.obstetric?.aog),
      fht: firstValue(patient.fht, dispatch.obstetric?.fht),
      ie: firstValue(patient.ie, dispatch.obstetric?.ie),
      placenta: firstValue(patient.placenta, dispatch.obstetric?.placenta),
    },
    crash: {
      ...freshPcr.crash,
      ...(dispatch.crash || {}),
      selfAccident: Boolean(dispatch.crash?.selfAccident || dispatch.selfAccident),
      collision: Boolean(dispatch.crash?.collision || dispatch.collision),
      vehicle: firstValue(dispatch.crash?.vehicle, dispatch.vehicleInvolved, dispatch.vehicleInvolve),
      role: firstValue(dispatch.crash?.role, patientCrashRole(patient)),
      plate: firstValue(dispatch.crash?.plate, dispatch.plateNumber, dispatch.plate),
      alcohol: firstValue(dispatch.crash?.alcohol, plusMinus(firstValue(patient.alcoholBreath, patient.alcohol))),
      helmet: firstValue(dispatch.crash?.helmet, plusMinus(patient.helmet)),
      license: firstValue(dispatch.crash?.license, plusMinus(firstValue(patient.driversLicense, patient.driverLicense, patient.license))),
    },
    hospitalName: firstValue(dispatch.hospitalName, dispatch.nameOfHospital),
    endorsementHospital: firstValue(dispatch.hospitalName, dispatch.nameOfHospital),
    status: "In Progress",
  });
}
