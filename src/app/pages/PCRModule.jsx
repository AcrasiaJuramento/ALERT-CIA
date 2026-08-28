import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, Camera, CheckCircle2, ClipboardList, Download, FileText, Maximize2, MapPin, Minus, Plus, RotateCcw, Save, Shield, Trash2, User, X } from "lucide-react";
import { AnatomyEditor, AnatomyFigure, PrintablePCR, SignaturePad } from "../components/PCRWidgets";
import IncidentLocationPicker from "../components/IncidentLocationPicker";
import { DISPATCH_EDIT_KEY } from "../utils/dispatchWorkflow";
import { createPCR, exportPCRToPdf, GCS_OPTIONS, INTERVENTIONS, newGcsRow, newVital, normalizeTimeValue, PCR_EDIT_KEY, synchronizePCR, travelDuration, validateChronology } from "../utils/pcrStorage";
import { getDispatchRecord, getDispatchRecordByResponse, getPCRReport, getPCRReportByResponse, listAmbulanceUnits, listCrewMembers, listRespondingTeams, resubmitReverseWorkflow, submitStandalonePCR } from "../services/supabase";
import { isValidIncidentCoordinate } from "../services/supabase/mappers";
import { hybridRepository } from "../api/hybrid-client";
import { firstRecordIdentifier, normalizeRecordIdentifier, randomUuid } from "../utils/uuid";
import { formatDateAndTime, formatLongDate } from "../utils/dateFormat";
import { mergePcrSources, pcrSeedFromDispatch as mapDispatchToPcr } from "../utils/pcrDispatchMapping";
import { toast } from "sonner";

const steps = [["Response & Patient", <Shield key="shield"/>], ["Assessment", <Activity key="activity"/>], ["Clinical Details", <User key="user"/>], ["Treatment & Handover", <ClipboardList key="clipboard"/>], ["Review & Export", <FileText key="file"/>]];
const input = "w-full px-3 py-2 bg-input-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500";
const emergencyTypes = ["Medical", "Pediatric", "Psychiatric", "Surgical", "Obstetrical", "Drowning", "Others"];
const traumaTypes = ["Trauma", "Fall", "Electrocution", "Domestic Violence", "Water Rescue Incident", "Fire Incident", "Assault", "Animal Bite", "Motor Vehicle Crash", "Others"];
const PIN_REQUIRED_MESSAGE = "Please pin the exact incident location inside Echague before saving this report.";
const PCR_REFERENCE_CACHE_KEY = "alert-cia:pcr-reference-options:v1";
const PCR_FORM_DRAFT_KEY_PREFIX = "alert-cia:pcr-form-draft:v1:";
const OTHERS_OPTION_VALUE = "__alert-cia-others__";
const medicalHistory = ["None", "Heart Disease", "Hypertension", "Seizure", "COPD", "Diabetes Mellitus", "Asthma", "Stroke", "Others"];
const MONTH_OPTIONS = [
  ["01", "Jan"], ["02", "Feb"], ["03", "Mar"], ["04", "Apr"], ["05", "May"], ["06", "Jun"],
  ["07", "Jul"], ["08", "Aug"], ["09", "Sep"], ["10", "Oct"], ["11", "Nov"], ["12", "Dec"],
];
const BIRTH_YEARS = Array.from({ length: 111 }, (_, index) => String(new Date().getFullYear() - index));
const BIRTH_DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
const timelineLabels = [
  ["Date of Incident", "dateOfIncident"],
  ["Time of Incident", "timeOfIncident"],
  ["Place of Incident", "placeOfIncident"],
  ["Dispatch Time", "dispatchTime"],
  ["Arrival at Scene", "arrivalScene"],
  ["Departure at Scene", "departureScene"],
  ["Arrival Endorsement Time", "endorsementTime"],
  ["Arrival at Hospital", "arrivalHospital"],
  ["Departure at Hospital", "departureHospital"],
  ["Back to Base", "backToBase"],
];

function Field({ label, children, wide = false }) { return <label className={wide ? "md:col-span-2" : ""}><span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>{children}</label>; }
function Section({ title, children }) { return <section className="border border-border rounded-xl overflow-hidden"><h3 className="px-4 py-2.5 bg-secondary text-sm font-bold text-foreground uppercase tracking-wide">{title}</h3><div className="p-4">{children}</div></section>; }
function TimelineSummary({ timeline }) {
  return <div className="grid md:grid-cols-5 gap-2">{timelineLabels.map(([label, key]) => <div className="rounded-lg border border-border bg-secondary/40 p-3" key={key}><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold text-foreground">{key === "dateOfIncident" ? formatLongDate(timeline[key], "Pending") : timeline[key] || "Pending"}</div></div>)}</div>;
}
function CheckGroup({ options, value = [], onChange, columns = 3 }) {
  const toggle = option => onChange(value.includes(option) ? value.filter(x => x !== option) : [...value, option]);
  const minWidth = columns === 2 ? "150px" : "170px";
  return <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))` }}>{options.map(option => <label key={option} className="flex gap-2 items-start min-w-0 text-xs leading-snug text-foreground p-2 rounded-lg border border-border bg-secondary/30"><input type="checkbox" checked={value.includes(option)} onChange={() => toggle(option)} className="accent-blue-600 shrink-0 mt-0.5" /><span className="min-w-0 whitespace-normal break-words">{option}</span></label>)}</div>;
}
function RadioButtons({ options, value, onChange }) { return <div className="flex flex-wrap gap-2">{options.map(option => <button type="button" key={option} onClick={() => onChange(option)} className={`px-3 py-2 rounded-lg border text-xs font-semibold ${value === option ? "bg-blue-600 border-blue-600 text-white" : "border-border text-muted-foreground"}`}>{option}</button>)}</div>; }
function SelectField({ label, value, options, onChange, placeholder = "Select" }) {
  return <Field label={label}><select className={input} value={value || ""} onChange={event => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
}
function OfflineSelectField({ label, value, options, onChange, placeholder, manualValue, onManualChange, manualPlaceholder, manualExample, allowManual = true }) {
  const [manualSelected, setManualSelected] = useState(false);
  const showManual = !value && (manualSelected || Boolean(manualValue));
  if (!allowManual) return <SelectField label={label} value={value} options={options} onChange={onChange} placeholder={placeholder}/>;
  const handleChange = nextValue => {
    if (nextValue === OTHERS_OPTION_VALUE) {
      setManualSelected(true);
      onChange("");
      return;
    }
    setManualSelected(false);
    onManualChange("");
    onChange(nextValue);
  };
  return <Field label={label}><div className="space-y-1.5"><select className={input} value={showManual ? OTHERS_OPTION_VALUE : value || ""} onChange={event => handleChange(event.target.value)}><option value="">{placeholder || "Select"}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}<option value={OTHERS_OPTION_VALUE}>Others</option></select>{showManual && <input className={`${input} text-xs`} value={manualValue || ""} onChange={event => onManualChange(event.target.value)} placeholder={manualPlaceholder || `Enter ${label.toLowerCase()}`} required />}{showManual && manualExample ? <p className="px-1 text-[10px] text-muted-foreground">Example format: {manualExample}</p> : null}</div></Field>;
}
function readPcrReferenceCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PCR_REFERENCE_CACHE_KEY) || "{}");
    return {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
      crew: Array.isArray(parsed.crew) ? parsed.crew : [],
    };
  } catch {
    return { teams: [], vehicles: [], crew: [] };
  }
}
function writePcrReferenceCache(value) {
  try {
    localStorage.setItem(PCR_REFERENCE_CACHE_KEY, JSON.stringify({ ...value, savedAt: new Date().toISOString() }));
  } catch {
    // The form still works when browser storage is unavailable.
  }
}
function pcrFormDraftKey({ editId, dispatchId }) {
  if (editId) return `${PCR_FORM_DRAFT_KEY_PREFIX}edit:${editId}`;
  if (dispatchId) return `${PCR_FORM_DRAFT_KEY_PREFIX}dispatch:${dispatchId}`;
  return `${PCR_FORM_DRAFT_KEY_PREFIX}standalone`;
}
function readPcrFormDraft(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" && parsed.form ? parsed : null;
  } catch {
    return null;
  }
}
function writePcrFormDraft(key, form, step) {
  try {
    localStorage.setItem(key, JSON.stringify({ form, step, savedAt: new Date().toISOString() }));
  } catch {
    // Draft autosave is a convenience; explicit saves still go through the repository.
  }
}
function clearPcrFormDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
}
function mergeCachedManualOptions(remote = [], cached = [], identity) {
  const next = [...remote];
  for (const option of cached.filter(item => item?.localManual)) {
    if (!next.some(item => identity(item) === identity(option))) next.push(option);
  }
  return next;
}
function manualReferenceId(type, value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `manual-${type}-${normalized || randomUuid()}`;
}
function formatCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Unable to read attachment."));
    reader.readAsDataURL(file);
  });
}
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image attachment."));
    image.src = dataUrl;
  });
}
function canvasToDataUrl(canvas, type) {
  return new Promise((resolve, reject) => {
    const outputType = ["image/jpeg", "image/png", "image/webp"].includes(type) ? type : "image/jpeg";
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Unable to watermark image attachment."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ data: reader.result, size: blob.size, type: outputType });
      reader.onerror = () => reject(reader.error || new Error("Unable to read watermarked image."));
      reader.readAsDataURL(blob);
    }, outputType, 0.9);
  });
}
function coordinateLabel(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(6) : "Unavailable";
}
function buildAttachmentWatermarkLines(form, location, capturedAt) {
  const latitude = location?.lat ?? form.latitude;
  const longitude = location?.lng ?? form.longitude;
  const incidentDate = formatDateAndTime(form.timeline?.dateOfIncident || form.dateOfIncident, form.timeline?.timeOfIncident || form.timeOfIncident);
  return [
    form.timeline?.placeOfIncident || form.placeOfIncident || form.locationText || "Incident location unavailable",
    `Lat ${coordinateLabel(latitude)}  Long ${coordinateLabel(longitude)}`,
    `Date ${incidentDate || new Date(capturedAt).toLocaleString()}`,
  ];
}
async function watermarkImageAttachment(file, dataUrl, form, location, capturedAt) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  const lines = buildAttachmentWatermarkLines(form, location, capturedAt);
  const fontSize = Math.max(16, Math.round(width * 0.025));
  const smallFontSize = Math.max(13, Math.round(fontSize * 0.78));
  const lineHeight = Math.round(fontSize * 1.32);
  const padding = Math.max(14, Math.round(width * 0.018));
  const panelHeight = padding * 2 + lineHeight * lines.length;
  const panelY = Math.max(0, height - panelHeight);

  context.fillStyle = "rgba(0, 0, 0, 0.62)";
  context.fillRect(0, panelY, width, panelHeight);
  context.fillStyle = "rgba(37, 99, 235, 0.92)";
  context.fillRect(0, panelY, Math.max(6, Math.round(width * 0.012)), panelHeight);
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.65)";
  context.shadowBlur = 3;
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  context.fillText(lines[0], padding, panelY + padding + fontSize, width - padding * 2);
  context.font = `600 ${smallFontSize}px Arial, sans-serif`;
  lines.slice(1).forEach((line, index) => {
    context.fillText(line, padding, panelY + padding + fontSize + lineHeight * (index + 1), width - padding * 2);
  });

  return canvasToDataUrl(canvas, file.type);
}
function FloatingTimelinePrompt({ item, onChange }) {
  if (!item) return null;
  return <div className="sticky top-3 z-30 ml-auto w-full max-w-xs rounded-lg border border-blue-500/30 bg-card p-3 shadow-xl"><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-400"><ClockIcon />{item.label}</div><button type="button" onClick={() => onChange(item.key, formatCurrentTime())} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">Yes</button></div>;
}
function ClockIcon() { return <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[9px]">T</span>; }
function splitBirthdate(value = "") {
  const [year = "", month = "", day = ""] = String(value || "").split("-");
  return { year, month, day };
}
function composeBirthdate({ year, month, day }) {
  return year && month && day ? `${year}-${month}-${day}` : "";
}
function possibleBirthYears(age) {
  const numericAge = Number(age);
  if (!Number.isInteger(numericAge) || numericAge < 0 || numericAge > 120) return [];
  const currentYear = new Date().getFullYear();
  return [String(currentYear - numericAge), String(currentYear - numericAge - 1)];
}
function ageFromBirthdate(value) {
  if (!value) return "";
  const birthdate = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(birthdate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const birthdayPassed = today.getMonth() > birthdate.getMonth()
    || (today.getMonth() === birthdate.getMonth() && today.getDate() >= birthdate.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 && age <= 120 ? String(age) : "";
}
function BirthdayInput({ form, update }) {
  const birthdateParts = splitBirthdate(form.birthday);
  const parts = {
    year: form.birthYear || birthdateParts.year,
    month: form.birthMonth || birthdateParts.month,
    day: form.birthDay || birthdateParts.day,
  };
  const updatePart = (key, value) => {
    const next = { ...parts, [key]: value };
    const birthdate = composeBirthdate(next);
    update("birthYear", next.year);
    update("birthMonth", next.month);
    update("birthDay", next.day);
    update("birthday", birthdate);
    if (birthdate) update("age", ageFromBirthdate(birthdate));
  };
  return <div className="grid grid-cols-3 gap-2"><Field label="Birth Year"><select className={input} value={parts.year} onChange={e=>updatePart("year",e.target.value)}><option value="">Year</option>{BIRTH_YEARS.map(year=><option key={year} value={year}>{year}</option>)}</select></Field><Field label="Month"><select className={input} value={parts.month} onChange={e=>updatePart("month",e.target.value)}><option value="">Month</option>{MONTH_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><Field label="Day"><select className={input} value={parts.day} onChange={e=>updatePart("day",e.target.value)}><option value="">Day</option>{BIRTH_DAYS.map(day=><option key={day} value={day}>{day}</option>)}</select></Field></div>;
}
function TriageButtons({ value, onChange }) {
  const active = {
    Red: "bg-red-600 border-red-600 text-white shadow-red-500/20",
    Yellow: "bg-yellow-400 border-yellow-400 text-slate-950 shadow-yellow-500/20",
    Green: "bg-green-600 border-green-600 text-white shadow-green-500/20",
    Black: "bg-slate-950 border-slate-950 text-white shadow-slate-900/20",
  };
  const inactive = {
    Red: "border-red-300 text-red-500 bg-red-500/10 hover:bg-red-500/20",
    Yellow: "border-yellow-300 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20",
    Green: "border-green-300 text-green-500 bg-green-500/10 hover:bg-green-500/20",
    Black: "border-slate-500 text-slate-300 bg-slate-900/30 hover:bg-slate-900/50",
  };
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{["Red","Yellow","Green","Black"].map(option => <button type="button" key={option} onClick={() => onChange(option)} className={`px-4 py-3 rounded-xl border-2 text-sm font-black uppercase tracking-wide shadow-sm transition-all ${value === option ? active[option] : inactive[option]}`}>{option}</button>)}</div>;
}

function isFilled(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(isFilled);
  return true;
}

function mergeNonEmpty(base = {}, override = {}) {
  const merged = { ...base };
  Object.entries(override || {}).forEach(([key, value]) => {
    if (!isFilled(value)) return;
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && merged[key]
      && typeof merged[key] === "object"
      && !Array.isArray(merged[key])
    ) {
      merged[key] = mergeNonEmpty(merged[key], value);
    } else {
      merged[key] = value;
    }
  });
  return merged;
}

function timeFromTimestamp(value) {
  return normalizeTimeValue(value);
}

function timelineTime(...values) {
  const value = values.find(item => String(item || "").trim());
  return value ? timeFromTimestamp(value) : "";
}

function plusMinus(value) {
  if (value === "+") return "Positive";
  if (value === "-") return "Negative";
  return value || "";
}

function firstFilled(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "") || "";
}

function patientCrashRole(patient = {}) {
  return [
    patient.driver && "Driver",
    patient.passenger && "Passenger",
    patient.pedestrian && "Pedestrian",
  ].filter(Boolean).join(" / ");
}

function selectedIncidentTypes(dispatch = {}) {
  if (Array.isArray(dispatch.natureTypes)) return dispatch.natureTypes;
  return String(dispatch.typeOfIncident || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function pcrSeedFromDispatch(dispatch = {}, pcrShell = {}, freshPcr = createPCR()) {
  try {
    return mapDispatchToPcr(dispatch, pcrShell, freshPcr);
  } catch (mappingError) {
    console.warn("Unable to apply the canonical dispatch-to-PCR mapping; using compatibility mapping.", mappingError);
  }
  const patient = dispatch.patients?.[0] || {};
  const selectedTypes = selectedIncidentTypes(dispatch);
  const seededEmergencyTypes = emergencyTypes.filter(type => selectedTypes.includes(type));
  const seededTraumaTypes = traumaTypes.filter(type => selectedTypes.includes(type));
  if (selectedTypes.includes("Medical") && !seededEmergencyTypes.includes("Medical")) seededEmergencyTypes.unshift("Medical");
  if (selectedTypes.some(type => traumaTypes.includes(type)) && !seededTraumaTypes.includes("Trauma")) seededTraumaTypes.unshift("Trauma");
  const dispatchTime = timelineTime(
    dispatch.dispatchedTime,
    dispatch.dispatchTime,
    dispatch.timeline?.dispatchTime,
    pcrShell.dispatchTime,
    pcrShell.timeline?.dispatchTime,
    dispatch.acceptedAt,
    dispatch.sentAt,
  );
  const incidentDate = dispatch.dateOfIncident || dispatch.date || freshPcr.dateOfIncident;
  const incidentTime = dispatch.timeOfIncident || freshPcr.timeOfIncident;
  const incidentPlace = dispatch.placeOfIncident || dispatch.locationText || freshPcr.placeOfIncident;
  return synchronizePCR({
    ...freshPcr,
    dispatchId: dispatch.dispatchId || dispatch.id,
    responseId: dispatch.responseId,
    responseNumber: dispatch.responseNumber || freshPcr.responseNumber,
    patientId: patient.id || patient.patientClientId || dispatch.patientId || null,
    dispatchPatientId: patient.id || dispatch.dispatchPatientId || null,
    patients: dispatch.patients || [],
    respondingTeam: dispatch.respondingTeam || dispatch.team || "",
    respondingTeamId: dispatch.respondingTeamId || null,
    vehicle: dispatch.vehicle || "",
    vehicleId: dispatch.vehicleId || null,
    driver: dispatch.driver || "",
    mainAider: firstFilled(dispatch.mainAider, dispatch.main_aider_name),
    groupLeader: firstFilled(dispatch.groupLeader, dispatch.group_leader, dispatch.groupLeaderName),
    assistantAider: firstFilled(dispatch.assistantAider, dispatch.assistant_aider_name),
    natureOfCall: selectedTypes.includes("Conduction") ? "Conduction" : "Emergency",
    dateOfIncident: incidentDate,
    timeOfIncident: incidentTime,
    placeOfIncident: incidentPlace,
    locationText: dispatch.locationText || incidentPlace,
    barangay: firstFilled(dispatch.barangay, dispatch.barangayName, dispatch.location_barangay),
    latitude: dispatch.latitude ?? "",
    longitude: dispatch.longitude ?? "",
    locationGeography: dispatch.locationGeography || "",
    dispatchTime,
    arrivalScene: timelineTime(dispatch.arrivalScene, dispatch.timeline?.arrivalScene, pcrShell.arrivalScene, pcrShell.timeline?.arrivalScene),
    departureScene: timelineTime(dispatch.departureScene, dispatch.timeline?.departureScene, pcrShell.departureScene, pcrShell.timeline?.departureScene),
    arrivalHospital: timelineTime(dispatch.arrivalHospital, dispatch.timeline?.arrivalHospital, pcrShell.arrivalHospital, pcrShell.timeline?.arrivalHospital),
    departureHospital: timelineTime(dispatch.departureHospital, dispatch.timeline?.departureHospital, pcrShell.departureHospital, pcrShell.timeline?.departureHospital),
    backToBase: timelineTime(dispatch.backToBase, dispatch.arrivalOffice, dispatch.timeline?.backToBase, pcrShell.backToBase, pcrShell.timeline?.backToBase),
    timeline: {
      dateOfIncident: incidentDate,
      timeOfIncident: incidentTime,
      placeOfIncident: incidentPlace,
      dispatchTime,
      arrivalScene: timelineTime(dispatch.arrivalScene, dispatch.timeline?.arrivalScene, pcrShell.arrivalScene, pcrShell.timeline?.arrivalScene),
      departureScene: timelineTime(dispatch.departureScene, dispatch.timeline?.departureScene, pcrShell.departureScene, pcrShell.timeline?.departureScene),
      arrivalHospital: timelineTime(dispatch.arrivalHospital, dispatch.timeline?.arrivalHospital, pcrShell.arrivalHospital, pcrShell.timeline?.arrivalHospital),
      departureHospital: timelineTime(dispatch.departureHospital, dispatch.timeline?.departureHospital, pcrShell.departureHospital, pcrShell.timeline?.departureHospital),
      backToBase: timelineTime(dispatch.backToBase, dispatch.arrivalOffice, dispatch.timeline?.backToBase, pcrShell.backToBase, pcrShell.timeline?.backToBase),
    },
    patientName: patient.name || dispatch.patientName || "",
    age: patient.age ?? dispatch.age ?? "",
    birthday: patient.birthdate || patient.birthday || dispatch.birthday || "",
    gender: patient.gender || dispatch.gender || "",
    address: patient.address || dispatch.address || "",
    contactPerson: patient.contactPerson || dispatch.contactPerson || dispatch.callerName || "",
    contactNumber: patient.contactNumber || dispatch.contactNumber || dispatch.callerContact || "",
    chiefComplaint: patient.assessmentFindings || dispatch.chiefComplaint || "",
    vitals: patient.bp || patient.pr || patient.rr || patient.temp || patient.o2Sat
      ? [{ id: randomUuid(), time: "", bp: patient.bp || "", pulse: patient.pr || "", respiratory: patient.rr || "", temperature: patient.temp || "", oxygen: patient.o2Sat || "" }]
      : freshPcr.vitals,
    emergencyTypes: seededEmergencyTypes,
    traumaTypes: seededTraumaTypes,
    emergencyOther: dispatch.otherMedical || dispatch.otherTrauma || dispatch.otherNature || "",
    assaultDetails: dispatch.assaultDetails || "",
    animalBiteDetails: dispatch.animalBiteDetails || "",
    incidentNature: dispatch.incidentNature || "",
    ingestionItem: dispatch.ingestionItem || dispatch.ifIngestion || dispatch.ingestionDetails || "",
    ingestionQuantity: dispatch.ingestionQuantity || dispatch.quantity || "",
    fallDetails: dispatch.fallDetails || dispatch.ifFall || "",
    obstetric: {
      ...freshPcr.obstetric,
      lmp: firstFilled(patient.lmp, dispatch.obstetric?.lmp),
      g: firstFilled(patient.g, dispatch.obstetric?.g),
      p: firstFilled(patient.p, dispatch.obstetric?.p),
      t: firstFilled(patient.t, dispatch.obstetric?.t),
      pa: firstFilled(patient.pa, dispatch.obstetric?.pa),
      baby: firstFilled(patient.l, patient.baby, dispatch.obstetric?.l, dispatch.obstetric?.baby),
      edc: firstFilled(patient.edc, dispatch.obstetric?.edc),
      bow: plusMinus(firstFilled(patient.bow, dispatch.obstetric?.bow)),
      aog: firstFilled(patient.aog, dispatch.obstetric?.aog),
      fht: firstFilled(patient.fht, dispatch.obstetric?.fht),
      ie: firstFilled(patient.ie, dispatch.obstetric?.ie),
    },
    crash: {
      ...freshPcr.crash,
      ...(dispatch.crash || {}),
      selfAccident: Boolean(dispatch.crash?.selfAccident || dispatch.selfAccident),
      collision: Boolean(dispatch.crash?.collision || dispatch.collision),
      vehicle: firstFilled(dispatch.crash?.vehicle, dispatch.vehicleInvolved, dispatch.vehicleInvolve),
      role: dispatch.crash?.role || patientCrashRole(patient),
      alcohol: firstFilled(dispatch.crash?.alcohol, plusMinus(firstFilled(patient.alcoholBreath, patient.alcohol))),
      helmet: firstFilled(dispatch.crash?.helmet, plusMinus(patient.helmet)),
      license: firstFilled(dispatch.crash?.license, plusMinus(firstFilled(patient.driversLicense, patient.driverLicense, patient.license))),
    },
    hospitalName: dispatch.hospitalName || dispatch.nameOfHospital || "",
  });
}

function DetailedPCRReview({ record, onClose }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const closeOnEscape = event => event.key === "Escape" && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  const changeZoom = amount => setZoom(value => Math.min(1.75, Math.max(.75, Number((value + amount).toFixed(2)))));
  const reviewScaleStyle = {
    width: "210mm",
    transform: `scale(${zoom})`,
    transformOrigin: "top center",
    marginBottom: `${Math.max(0, zoom - 1) * 1200}px`,
  };
  return createPortal(<div className="fixed inset-0 z-[5000] bg-black/75 p-2 md:p-5 flex flex-col" role="dialog" aria-modal="true" aria-label="Detailed PCR report review">
    <div className="relative z-20 bg-card border border-border rounded-t-xl px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-bold text-sm md:text-base">Detailed PCR Report</h2><p className="text-[11px] text-muted-foreground">Zoom and scroll to review every section before submission.</p></div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => changeZoom(-.25)} disabled={zoom <= .75} aria-label="Zoom out" className="p-2 rounded-lg bg-secondary disabled:opacity-40"><Minus size={16}/></button>
        <button type="button" onClick={() => setZoom(1)} className="min-w-16 px-2 py-2 rounded-lg bg-secondary text-xs font-semibold" title="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => changeZoom(.25)} disabled={zoom >= 1.75} aria-label="Zoom in" className="p-2 rounded-lg bg-secondary disabled:opacity-40"><Plus size={16}/></button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom" className="p-2 rounded-lg bg-secondary"><RotateCcw size={16}/></button>
        <button type="button" onClick={onClose} aria-label="Close detailed report" className="p-2 rounded-lg bg-red-500/10 text-red-500 ml-1"><X size={18}/></button>
      </div>
    </div>
    <div className="flex-1 overflow-auto bg-slate-200 rounded-b-xl p-2 md:p-6">
      <div className="mx-auto bg-white shadow-xl" style={reviewScaleStyle}><PrintablePCR record={record}/></div>
    </div>
  </div>, document.body);
}

export default function PCRModule() {
  const navigate = useNavigate(); const [params] = useSearchParams(); const [step, setStep] = useState(0); const dispatchId = normalizeRecordIdentifier(params.get("dispatch")); const responseId = normalizeRecordIdentifier(params.get("response")); const editId = normalizeRecordIdentifier(params.get("edit") || (!dispatchId ? sessionStorage.getItem(PCR_EDIT_KEY) : null)); const [form, setForm] = useState(() => synchronizePCR(createPCR())); const [linkedDispatch, setLinkedDispatch] = useState(null); const [loading, setLoading] = useState(Boolean(editId || dispatchId)); const [bodyOpen, setBodyOpen] = useState(false); const [reviewOpen, setReviewOpen] = useState(false); const [message, setMessage] = useState(""); const [savingStatus, setSavingStatus] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = useMemo(() => pcrFormDraftKey({ editId, dispatchId }), [dispatchId, editId]);
  const [teamOptions, setTeamOptions] = useState(() => readPcrReferenceCache().teams);
  const [vehicleOptions, setVehicleOptions] = useState(() => readPcrReferenceCache().vehicles);
  const [crewOptions, setCrewOptions] = useState(() => readPcrReferenceCache().crew);
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([listRespondingTeams(), listAmbulanceUnits(), listCrewMembers()])
      .then(([teamsResult, vehiclesResult, crewResult]) => {
        if (!mounted) return;
        const cached = readPcrReferenceCache();
        const next = {
          teams: teamsResult.status === "fulfilled" ? mergeCachedManualOptions(teamsResult.value, cached.teams, item => String(item.name || "").trim().toLowerCase()) : cached.teams,
          vehicles: vehiclesResult.status === "fulfilled" ? mergeCachedManualOptions(vehiclesResult.value, cached.vehicles, item => String(item.call_sign || "").trim().toLowerCase()) : cached.vehicles,
          crew: crewResult.status === "fulfilled" ? mergeCachedManualOptions(crewResult.value, cached.crew, item => `${item.role}:${String(item.name || "").trim().toLowerCase()}`) : cached.crew,
        };
        setTeamOptions(next.teams);
        setVehicleOptions(next.vehicles);
        setCrewOptions(next.crew);
        if ([teamsResult, vehiclesResult, crewResult].some(result => result.status === "fulfilled")) writePcrReferenceCache(next);
        const failed = [teamsResult, vehiclesResult, crewResult].find(result => result.status === "rejected");
        if (failed) {
          toast.error(failed.reason?.message || "Unable to load some form reference data.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    sessionStorage.removeItem(PCR_EDIT_KEY);
    let mounted = true;
    const restoreLocalDraft = baseForm => {
      const draft = readPcrFormDraft(draftKey);
      if (!draft?.form) return synchronizePCR(baseForm);
      if (Number.isInteger(draft.step)) setStep(Math.max(0, Math.min(steps.length - 1, draft.step)));
      return synchronizePCR(mergePcrSources(baseForm, draft.form));
    };
    async function loadPCR() {
      if (!editId && !dispatchId) {
        if (mounted) {
          setForm(restoreLocalDraft({
            ...createPCR(),
            workflowOrigin: "reverse",
            offlineStandalone: true,
          }));
          setDraftReady(true);
        }
        return;
      }
      setLoading(true);
      try {
        const loadCachedDispatchByResponse = async linkedResponseId => {
          if (!linkedResponseId) return null;
          const cached = await hybridRepository.getLocalDispatchRecords().catch(() => []);
          return cached.find(item => item.responseId === linkedResponseId || item.responseClientId === linkedResponseId) || null;
        };
        const loadLinkedDispatch = async (linkedDispatchId, linkedResponseId) => {
          let dispatch = null;
          if (linkedDispatchId) {
            dispatch = await getDispatchRecord(linkedDispatchId).catch(() => null);
            if (!dispatch) dispatch = await hybridRepository.getLocalDispatchRecord(linkedDispatchId).catch(() => null);
          }
          if (!dispatch && linkedResponseId) dispatch = await getDispatchRecordByResponse(linkedResponseId).catch(() => null);
          if (!dispatch) dispatch = await loadCachedDispatchByResponse(linkedResponseId);
          return dispatch;
        };
        if (editId) {
          let record = await getPCRReport(editId).catch(() => null);
          if (!record) record = await hybridRepository.getLocalPcrReport(editId).catch(() => null);
          if (!record && responseId) {
            record = await getPCRReportByResponse(responseId).catch(() => null);
          }
          const linkedResponseId = firstRecordIdentifier(record?.responseId, responseId);
          const dispatch = await loadLinkedDispatch(firstRecordIdentifier(dispatchId, record?.dispatchId), linkedResponseId);
          if (mounted && (record || dispatch)) {
            const freshPcr = createPCR();
            const shell = record || { id: editId, pcrId: editId, responseId: linkedResponseId, status: "In Progress" };
            const seeded = dispatch
              ? mergePcrSources(pcrSeedFromDispatch(dispatch, shell, freshPcr), shell)
              : mergePcrSources(freshPcr, shell);
            setLinkedDispatch(dispatch);
            setForm(restoreLocalDraft(seeded));
          } else if (mounted) {
            throw new Error("This Patient Care Report and its linked dispatch could not be loaded.");
          }
        } else if (dispatchId) {
          let dispatch = await getDispatchRecord(dispatchId).catch(() => null);
          if (!dispatch) dispatch = await hybridRepository.getLocalDispatchRecord(dispatchId).catch(() => null);
          if (mounted && dispatch) {
            const pcrShell = dispatch.responseId
              ? await getPCRReportByResponse(dispatch.responseId).catch(() => null)
              : null;
            const freshPcr = createPCR();
            setLinkedDispatch(dispatch);
            const dispatchSeed = pcrSeedFromDispatch(dispatch, pcrShell, freshPcr);
            setForm(restoreLocalDraft(mergeNonEmpty(dispatchSeed, {
              ...(pcrShell || {}),
              id: pcrShell?.id || pcrShell?.pcrId || freshPcr.id,
              pcrId: pcrShell?.pcrId || pcrShell?.id || freshPcr.id,
              dispatchId: dispatch.dispatchId || dispatch.id,
              responseId: dispatch.responseId,
              responseNumber: dispatch.responseNumber || pcrShell?.responseNumber || freshPcr.responseNumber,
              dispatchTime: dispatchSeed.dispatchTime,
              arrivalScene: dispatchSeed.arrivalScene,
              departureScene: dispatchSeed.departureScene,
              timeline: {
                ...(pcrShell?.timeline || {}),
                dispatchTime: dispatchSeed.dispatchTime,
                arrivalScene: dispatchSeed.arrivalScene,
                departureScene: dispatchSeed.departureScene,
                arrivalHospital: dispatchSeed.timeline?.arrivalHospital,
                departureHospital: dispatchSeed.timeline?.departureHospital,
                backToBase: dispatchSeed.timeline?.backToBase,
              },
              patients: dispatch.patients,
              patientId: pcrShell?.patientId || dispatch.patients?.[0]?.id || dispatch.patientId || null,
            })));
          }
        }
      } catch (error) {
        toast.error(error.message || "Unable to load PCR report.");
      } finally {
        if (mounted) {
          setLoading(false);
          setDraftReady(true);
        }
      }
    }
    loadPCR();
    return () => {
      mounted = false;
    };
  }, [dispatchId, draftKey, editId, responseId]);
  useEffect(() => {
    if (!draftReady || loading) return;
    writePcrFormDraft(draftKey, form, step);
  }, [draftKey, draftReady, form, loading, step]);
  const update = (key, value) => setForm(f => synchronizePCR({ ...f, [key]: value }));
  const updateTeam = teamId => {
    const team = effectiveTeamOptions.find(option => option.id === teamId);
    setForm(f => synchronizePCR({ ...f, respondingTeamId: teamId, respondingTeam: team?.name || "", team: team?.name || "" }));
  };
  const updateVehicle = vehicleId => {
    const vehicle = effectiveVehicleOptions.find(option => option.id === vehicleId);
    setForm(f => synchronizePCR({ ...f, vehicleId, vehicle: vehicle?.call_sign || "" }));
  };
  const updateTeamManually = value => setForm(f => synchronizePCR({ ...f, respondingTeamId: "", respondingTeam: value, team: value }));
  const updateVehicleManually = value => setForm(f => synchronizePCR({ ...f, vehicleId: "", vehicle: value }));
  const saveManualReferencesToDropdowns = record => {
    if (!isStandalonePCR) return;
    const team = String(record.respondingTeam || record.team || "").trim();
    const vehicle = String(record.vehicle || "").trim();
    const manualCrew = [
      ["driver", record.driver],
      ["main_aider", record.mainAider],
      ["group_leader", record.groupLeader],
      ["assistant_aider", record.assistantAider],
    ].filter(([, name]) => String(name || "").trim());
    const nextTeams = team && !teamOptions.some(item => item.name?.trim().toLowerCase() === team.toLowerCase())
      ? [...teamOptions, { id: manualReferenceId("team", team), name: team, localManual: true }]
      : teamOptions;
    const nextVehicles = vehicle && !vehicleOptions.some(item => item.call_sign?.trim().toLowerCase() === vehicle.toLowerCase())
      ? [...vehicleOptions, { id: manualReferenceId("vehicle", vehicle), call_sign: vehicle, plate_number: "", localManual: true }]
      : vehicleOptions;
    const nextCrew = [...crewOptions];
    for (const [role, rawName] of manualCrew) {
      const name = String(rawName).trim();
      if (!nextCrew.some(item => item.role === role && item.name?.trim().toLowerCase() === name.toLowerCase())) {
        nextCrew.push({ id: manualReferenceId(role, name), name, role, responding_team_id: null, localManual: true });
      }
    }
    setTeamOptions(nextTeams);
    setVehicleOptions(nextVehicles);
    setCrewOptions(nextCrew);
    writePcrReferenceCache({ teams: nextTeams, vehicles: nextVehicles, crew: nextCrew });
  };
  const teamName = form.respondingTeam || form.team || "";
  const effectiveTeamOptions = useMemo(() => {
    const options = [...teamOptions];
    if (form.respondingTeamId && teamName && !options.some(team => team.id === form.respondingTeamId)) {
      options.unshift({ id: form.respondingTeamId, name: teamName, localFallback: true });
    }
    return options;
  }, [form.respondingTeamId, teamName, teamOptions]);
  const effectiveVehicleOptions = useMemo(() => {
    const options = [...vehicleOptions];
    if (form.vehicleId && form.vehicle && !options.some(unit => unit.id === form.vehicleId)) {
      options.unshift({ id: form.vehicleId, call_sign: form.vehicle, localFallback: true });
    }
    return options;
  }, [form.vehicle, form.vehicleId, vehicleOptions]);
  const selectedTeamId = form.respondingTeamId || effectiveTeamOptions.find(team => team.name === teamName)?.id || "";
  const selectedVehicleId = form.vehicleId || effectiveVehicleOptions.find(unit => unit.call_sign === form.vehicle)?.id || "";
  const isStandalonePCR = !dispatchId && !linkedDispatch && !form.dispatchId;
  const savedCrewByRole = {
    driver: form.driver,
    main_aider: form.mainAider,
    group_leader: form.groupLeader,
    assistant_aider: form.assistantAider,
  };
  const crewSelectOptions = role => {
    const options = crewOptions
      .filter(member => member.role === role)
      .filter(member => !selectedTeamId || !member.responding_team_id || member.responding_team_id === selectedTeamId)
      .map(member => ({ value: member.name, label: member.name }));
    const savedName = savedCrewByRole[role];
    if (savedName && !options.some(option => option.value === savedName)) {
      options.unshift({ value: savedName, label: savedName });
    }
    return options;
  };
  const crewHasListedOption = (role, name) => Boolean(name) && crewSelectOptions(role)
    .some(option => option.value === name);
  const updateAge = value => setForm(f => {
    const yearHints = possibleBirthYears(value);
    const birthdateParts = splitBirthdate(f.birthday);
    const nextParts = {
      year: yearHints[0] || f.birthYear || birthdateParts.year,
      month: f.birthMonth || birthdateParts.month,
      day: f.birthDay || birthdateParts.day,
    };
    return synchronizePCR({
      ...f,
      age: value,
      birthYear: nextParts.year,
      birthMonth: nextParts.month,
      birthDay: nextParts.day,
      birthday: composeBirthdate(nextParts),
    });
  });
  const updateTimeline = (key, value) => setForm(f => synchronizePCR({ ...f, [key]: value, timeline: { ...(f.timeline || {}), [key]: value } }));
  const updateIncidentLocation = location => setForm(f => synchronizePCR({
    ...f,
    barangay: location.barangay || f.barangay,
    placeOfIncident: location.locationText || f.placeOfIncident,
    locationText: location.locationText || f.locationText || f.placeOfIncident,
    latitude: location.latitude,
    longitude: location.longitude,
    locationGeography: location.locationGeography,
    boundarySource: location.boundarySource,
    timeline: {
      ...(f.timeline || {}),
      placeOfIncident: location.locationText || f.timeline?.placeOfIncident || f.placeOfIncident,
    },
  }));
  const updateHospitalArrival = value => setForm(f => synchronizePCR({
    ...f,
    timeline: { ...(f.timeline || {}), endorsementTime: value, arrivalHospital: value },
    arrivalHospital: value,
    hospitalTime: value,
    endorsementTime: value,
    transferArrivalTime: value,
  }));
  const updateIncidentTypeGroup = (key, value) => setForm(f => {
    const otherKey = key === "emergencyTypes" ? "traumaTypes" : "emergencyTypes";
    const next = { ...f, [key]: value };
    if (!value.includes("Others") && !(f[otherKey] || []).includes("Others")) next.emergencyOther = "";
    if (key === "traumaTypes") {
      if (!value.includes("Assault")) next.assaultDetails = "";
      if (!value.includes("Animal Bite")) next.animalBiteDetails = "";
      if (!value.includes("Fall")) next.fallDetails = "";
    }
    return synchronizePCR(next);
  });
  const updateListWithOtherDetail = (key, value, detailKey) => setForm(f => synchronizePCR({
    ...f,
    [key]: value,
    ...(!value.includes("Others") ? { [detailKey]: "" } : {}),
  }));
  const updateBreathing = value => setForm(f => synchronizePCR({
    ...f,
    breathing: value,
    ...(!value.includes("Others") ? { oxygenVia: "" } : {}),
  }));
  const updateInterventionResult = (item, value) => setForm(f => synchronizePCR({
    ...f,
    interventions: { ...f.interventions, [item]: value },
    interventionDetails: value === "Yes" ? f.interventionDetails : { ...f.interventionDetails, [item]: "" },
  }));
  const nested = (key, child, value) => setForm(f => ({ ...f, [key]: { ...f[key], [child]: value } }));
  const signature = (key, value) => nested("signatures", key, value); const signatureName = (key, value) => nested("signatureNames", key, value); const signatureDate = (key, value) => nested("signatureDates", key, value);
  const gcsRows = form.gcsRows?.length ? form.gcsRows : [form.gcs];
  const currentGcs = [...gcsRows].reverse().find(row => row?.eye || row?.verbal || row?.motor) || gcsRows[gcsRows.length - 1] || form.gcs;
  const gcsTotal = useMemo(() => Number(currentGcs?.eye || 0) + Number(currentGcs?.verbal || 0) + Number(currentGcs?.motor || 0), [currentGcs]);
  const chronologyError = useMemo(() => validateChronology(form), [form]);
  const hospitalTravel = travelDuration(form.departureScene, form.arrivalHospital);
  const returnTravel = travelDuration(form.departureHospital, form.backToBase);
  const needsHospital = form.hospitalization?.status === "Yes";
  const activeTimelinePrompt = useMemo(() => {
    const timeline = form.timeline || {};
    const valueFor = key => timeline[key] || form[key] || "";
    const prompts = [
      ["arrivalScene", "Arrival at Scene"],
      ["departureScene", "Departure at Scene"],
      ...(needsHospital ? [["arrivalHospital", "Arrival at Hospital"], ["departureHospital", "Departure at Hospital"]] : []),
    ];
    const next = prompts.find(([key]) => !valueFor(key));
    return next ? { key: next[0], label: next[1], value: valueFor(next[0]) } : null;
  }, [form, needsHospital]);
  const missingRequiredForStep = (stepIndex, submitting = false) => {
    const firstVital = form.vitals?.[0] || {};
    const firstGcs = gcsRows?.[0] || {};
    const responsePatientRequired = [
      ['Responding Team', form.respondingTeam || form.team], ['Vehicle', form.vehicle], ['Driver', form.driver], ['Main Aider', form.mainAider],
      ['Patient Name', form.patientName], ['Age', form.age], ['Birthday', form.birthday], ['Gender', form.gender], ['Civil Status', form.civilStatus],
      ['Address', form.address], ['Contact Person', form.contactPerson], ['Contact Number', form.contactNumber], ['Nature of Call', form.natureOfCall],
      ['Date of Incident', form.dateOfIncident], ['Time of Incident', form.timeOfIncident], ['Place of Incident', form.placeOfIncident],
      ['Barangay', form.barangay], ...(!isStandalonePCR ? [['Dispatch Time', form.dispatchTime]] : [])
    ];
    const required = stepIndex === 0 ? responsePatientRequired : stepIndex === 1 ? [
      ['Arrival at Scene', form.arrivalScene], ...(submitting ? [['Departure at Scene', form.departureScene]] : []), ['Triage', form.triage],
      ['Type of Emergency', [...(form.emergencyTypes || []), ...(form.traumaTypes || [])].length],
      ['Chief Complaint', form.chiefComplaint], ['Vital Sign Time', firstVital.time], ['Blood Pressure', firstVital.bp], ['Pulse Rate', firstVital.pulse],
      ['Respiratory Rate', firstVital.respiratory], ['Temperature', firstVital.temperature], ['Oxygen Saturation', firstVital.oxygen],
      ['GCS Eye', firstGcs.eye], ['GCS Verbal', firstGcs.verbal], ['GCS Motor', firstGcs.motor]
    ] : stepIndex === 2 ? [
      ['Airway', form.airway?.length], ['Breathing', form.breathing?.length], ['Pulse', form.pulseFindings?.length], ['Pupils', form.pupils?.length],
      ['Skin', form.skin?.length], ['Allergy Status', form.allergies?.status], ['Suspected Spinal Injury', form.suspectedSpinal], ['Pain Assessment', form.painPositive]
    ] : stepIndex === 3 ? [
      ['Hospitalization Decision', form.hospitalization?.status], ...INTERVENTIONS.map(item => [`Intervention: ${item}`, form.interventions?.[item]])
    ] : [];
    return required.filter(([, value]) => value === undefined || value === null || value === '' || value === 0).map(([label]) => label);
  };
  const validateRequiredStep = (stepIndex, submitting = false) => {
    const missing = missingRequiredForStep(stepIndex, submitting);
    if (!missing.length) return true;
    const messageText = `Complete required fields: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.`;
    setMessage(messageText);
    toast.error(messageText);
    return false;
  };
  const goNext = () => {
    if (!validateRequiredStep(step)) return;
    setStep(s => s + 1);
  };
  const store = async status => {
    if (savingStatus) return;
    if (status !== "Draft") {
      for (let index = 0; index < 4; index += 1) {
        if (!validateRequiredStep(index, true)) { setStep(index); return; }
      }
      if (needsHospital && (!(form.timeline?.arrivalHospital || form.arrivalHospital) || !(form.timeline?.departureHospital || form.departureHospital))) {
        setStep(3);
        setMessage("Arrival and departure hospital times are required before submitting.");
        toast.error("Fill Arrival at Hospital and Departure at Hospital before submitting.");
        return;
      }
    }
    if (chronologyError) { setMessage(chronologyError); return; }
    if (!isValidIncidentCoordinate(form.latitude, form.longitude)) {
      setMessage(PIN_REQUIRED_MESSAGE);
      toast.error(PIN_REQUIRED_MESSAGE);
      return;
    }
    setSavingStatus(status);
    try {
      const reverseSubmit = form.workflowOrigin === "reverse" && status !== "Draft";
      const preserveReturnedCompletion = form.status === "Returned for Correction";
      const submitTimeline = status === "Draft"
        ? form.timeline
        : { ...(form.timeline || {}), backToBase: preserveReturnedCompletion ? form.timeline?.backToBase || form.backToBase : "" };
      const payload = {
        ...form,
        responseId: firstRecordIdentifier(form.responseId, linkedDispatch?.responseId, responseId),
        responseClientId: firstRecordIdentifier(form.responseClientId, linkedDispatch?.responseClientId, linkedDispatch?.responseId, responseId),
        dispatchId: firstRecordIdentifier(form.dispatchId, linkedDispatch?.dispatchId, linkedDispatch?.id, dispatchId),
        dispatchClientId: firstRecordIdentifier(form.dispatchClientId, linkedDispatch?.dispatchClientId, linkedDispatch?.dispatchId, linkedDispatch?.id, dispatchId),
        status: reverseSubmit ? "Draft" : status,
        id: form.id || randomUuid(),
        timeline: submitTimeline,
        backToBase: status === "Draft" || preserveReturnedCompletion ? form.backToBase : "",
        completedAt: status === "Draft" || preserveReturnedCompletion ? form.completedAt : "",
        resolvedAt: status === "Draft" || preserveReturnedCompletion ? form.resolvedAt : "",
        wasReturnedForCorrection: preserveReturnedCompletion,
      };
      const saved = status === "Draft" || reverseSubmit
        ? await hybridRepository.savePcrDraft(payload)
        : await hybridRepository.submitPcr(payload);
      if (reverseSubmit && !payload.offlineStandalone && !saved.offlineStandalone) {
        const pcrId = saved.id || saved.pcrId || form.id;
        if (form.status === 'Returned for Correction') await resubmitReverseWorkflow(pcrId);
        else await submitStandalonePCR(pcrId);
      }
      saveManualReferencesToDropdowns(payload);
      setForm(synchronizePCR({ ...form, ...saved }));
      setMessage(saved.hybridMessage || (status === "Draft" ? "Draft saved." : "PCR submitted successfully."));
      if (status !== "Draft") {
        setDraftReady(false);
        clearPcrFormDraft(draftKey);
        setTimeout(() => navigate("/admin/pcr"), 800);
      }
    } catch (error) {
      setMessage(error.message || "Unable to save PCR report.");
    } finally {
      setSavingStatus("");
    }
  };
  const downloadPdf = async () => {
    try {
      await exportPCRToPdf(form);
      toast.success("Patient Care Report PDF downloaded.");
    } catch {
      toast.error("Unable to generate the PDF. Please try again.");
    }
  };
  const setVital = (id, key, value) => update("vitals", form.vitals.map(v => v.id === id ? { ...v, [key]: value } : v));
  const setGcsRow = (id, key, value) => update("gcsRows", gcsRows.map(row => row.id === id ? { ...row, [key]: value } : row));
  const addMedication = () => update("medications", [...form.medications, { drug: "", dose: "", dateTime: "" }]);
  const setMedication = (index, key, value) => update("medications", form.medications.map((m,i)=>i===index?{...m,[key]:value}:m));
  const upload = async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    const location = await new Promise(resolve => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 5000 }) : resolve(null));
    const items = await Promise.all(files.map(async file => {
      const capturedAt = new Date().toISOString();
      const originalData = await readFileAsDataUrl(file);
      if (!file.type.startsWith("image/")) {
        return { id: randomUuid(), name: file.name, type: file.type, size: file.size, data: originalData, location, capturedAt };
      }
      try {
        const watermarked = await watermarkImageAttachment(file, originalData, form, location, capturedAt);
        return {
          id: randomUuid(),
          name: file.name,
          type: watermarked.type,
          size: watermarked.size,
          data: watermarked.data,
          originalSize: file.size,
          location,
          capturedAt,
          watermarked: true,
        };
      } catch {
        return { id: randomUuid(), name: file.name, type: file.type, size: file.size, data: originalData, location, capturedAt, watermarkFailed: true };
      }
    }));
    update("attachments", [...form.attachments, ...items]);
    e.target.value = "";
  };

  return <div className="p-4 md:p-6 max-w-7xl mx-auto text-foreground">
    {loading && <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Loading PCR report...</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><div><button onClick={() => navigate("/admin/pcr")} className="text-xs text-blue-400 mb-2 flex items-center gap-1"><ArrowLeft size={13}/>Patient Care Records</button><h1 className="text-xl font-bold flex items-center gap-2"><FileText className="text-blue-500"/>Create PCR Report</h1><p className="text-xs text-muted-foreground">Create and submit a new Patient Care Report.</p></div><div className="flex gap-2"><button onClick={() => store("Draft")} disabled={Boolean(savingStatus)} className="px-4 py-2 rounded-lg bg-secondary text-sm flex gap-2 items-center disabled:opacity-60"><Save size={15}/>{savingStatus === "Draft" ? "Saving..." : "Save Draft"}</button><button onClick={downloadPdf} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm flex gap-2 items-center"><Download size={15}/>Download PDF</button></div></div>
    {linkedDispatch && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm"><div><div className="font-semibold text-blue-300">Linked Dispatch Form</div><div className="text-xs text-muted-foreground">{linkedDispatch.responseNumber || linkedDispatch.id} · {linkedDispatch.placeOfIncident || "No location entered"}</div></div><button onClick={() => { sessionStorage.setItem('alert-cia-navigation-dispatch', JSON.stringify(linkedDispatch)); const navigationId = linkedDispatch.dispatchId || linkedDispatch.id; navigate(navigationId ? `/admin/dispatch/navigation/${navigationId}` : '/admin/dispatch/navigation'); }} className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300">View linked dispatch route</button></div>}
    {message && <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${chronologyError || message === PIN_REQUIRED_MESSAGE || message.startsWith("Unable") ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-green-500/10 border-green-500/30 text-green-500"}`}>{message}</div>}
    {chronologyError && <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">{chronologyError}</div>}
    <div className="grid grid-cols-5 gap-1 mb-5">{steps.map(([name,icon],i)=><button key={name} onClick={()=>{ if (i > step) { for (let index = step; index < i; index += 1) { if (!validateRequiredStep(index)) { setStep(index); return; } } } setStep(i); }} className={`p-2 md:p-3 rounded-lg border text-center ${step===i?"bg-blue-600 border-blue-600 text-white":"bg-card border-border text-muted-foreground"}`}><span className="block w-4 h-4 mx-auto mb-1">{icon}</span><span className="text-[10px] md:text-xs font-semibold">{name}</span></button>)}</div>
    <div className="space-y-4">
      <FloatingTimelinePrompt item={activeTimelinePrompt} onChange={updateTimeline} />
      {step === 0 && <>
        <Section title="Response and Unit Details"><div className="grid md:grid-cols-3 gap-3"><Field label="Response No."><input className={`${input} font-mono text-blue-400`} value={form.responseNumber} readOnly/></Field><OfflineSelectField label="Responding Team" value={selectedTeamId} options={effectiveTeamOptions.map(team => ({ value: team.id, label: team.name }))} onChange={updateTeam} placeholder="Select responding team" manualValue={selectedTeamId ? "" : teamName} onManualChange={updateTeamManually} manualExample="Alpha Run 1" allowManual={isStandalonePCR}/><OfflineSelectField label="Vehicle" value={selectedVehicleId} options={effectiveVehicleOptions.map(unit => ({ value: unit.id, label: `${unit.call_sign}${unit.plate_number ? ` - ${unit.plate_number}` : ""}` }))} onChange={updateVehicle} placeholder="Select available ambulance" manualValue={selectedVehicleId ? "" : form.vehicle} onManualChange={updateVehicleManually} manualExample="Ambulance 1 - 00214" allowManual={isStandalonePCR}/><OfflineSelectField label="Driver" value={crewHasListedOption("driver", form.driver) ? form.driver : ""} options={crewSelectOptions("driver")} onChange={value=>update("driver",value)} placeholder="Select driver" manualValue={crewHasListedOption("driver", form.driver) ? "" : form.driver} onManualChange={value=>update("driver",value)} manualExample="Juan Dela Cruz" allowManual={isStandalonePCR}/><OfflineSelectField label="Main Aider" value={crewHasListedOption("main_aider", form.mainAider) ? form.mainAider : ""} options={crewSelectOptions("main_aider")} onChange={value=>update("mainAider",value)} placeholder="Select main aider" manualValue={crewHasListedOption("main_aider", form.mainAider) ? "" : form.mainAider} onManualChange={value=>update("mainAider",value)} manualExample="Juan Dela Cruz" allowManual={isStandalonePCR}/><OfflineSelectField label="Group Leader" value={crewHasListedOption("group_leader", form.groupLeader) ? form.groupLeader : ""} options={crewSelectOptions("group_leader")} onChange={value=>update("groupLeader",value)} placeholder="Select group leader" manualValue={crewHasListedOption("group_leader", form.groupLeader) ? "" : form.groupLeader} onManualChange={value=>update("groupLeader",value)} manualExample="Juan Dela Cruz" allowManual={isStandalonePCR}/><OfflineSelectField label="Assistant Aider" value={crewHasListedOption("assistant_aider", form.assistantAider) ? form.assistantAider : ""} options={crewSelectOptions("assistant_aider")} onChange={value=>update("assistantAider",value)} placeholder="Select assistant aider" manualValue={crewHasListedOption("assistant_aider", form.assistantAider) ? "" : form.assistantAider} onManualChange={value=>update("assistantAider",value)} manualExample="Juan Dela Cruz" allowManual={isStandalonePCR}/></div></Section>
        <Section title="Patient Information"><div className="grid md:grid-cols-4 gap-3"><Field label="Patient Name" wide><input className={input} value={form.patientName} onChange={e=>update("patientName",e.target.value)}/></Field><Field label="Age"><input type="number" className={input} value={form.age} onChange={e=>updateAge(e.target.value)}/></Field><BirthdayInput form={form} update={update}/><Field label="Gender"><select className={input} value={form.gender} onChange={e=>update("gender",e.target.value)}><option value="">Select</option>{["Unknown","Male","Female","Other"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Civil Status"><select className={input} value={form.civilStatus} onChange={e=>update("civilStatus",e.target.value)}><option value="">Select</option>{["Unknown","Single","Married","Widowed","Separated"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Address" wide><input className={input} value={form.address} onChange={e=>update("address",e.target.value)}/></Field><Field label="Contact Person"><input className={input} value={form.contactPerson} onChange={e=>update("contactPerson",e.target.value)}/></Field><Field label="Contact Number"><input className={input} value={form.contactNumber} onChange={e=>update("contactNumber",e.target.value)}/></Field></div></Section>
        <Section title="Nature and Initial Incident Details"><div className="mb-3"><RadioButtons options={["Emergency","Conduction"]} value={form.natureOfCall} onChange={v=>update("natureOfCall",v)}/></div><div className="grid md:grid-cols-4 gap-3"><Field label="Date of Incident"><input type="date" className={input} value={form.timeline?.dateOfIncident || form.dateOfIncident} onChange={e=>updateTimeline("dateOfIncident",e.target.value)}/></Field><Field label="Time of Incident"><input type="time" className={input} value={form.timeline?.timeOfIncident || form.timeOfIncident} onChange={e=>updateTimeline("timeOfIncident",e.target.value)}/></Field><Field label="Place of Incident"><input className={input} value={form.timeline?.placeOfIncident || form.placeOfIncident} onChange={e=>setForm(f=>synchronizePCR({...f,placeOfIncident:e.target.value,locationText:e.target.value,timeline:{...(f.timeline||{}),placeOfIncident:e.target.value}}))}/></Field><Field label="Barangay"><input className={input} value={form.barangay || ""} onChange={e=>update("barangay",e.target.value)}/></Field><Field label="Dispatch Time"><input type="time" className={input} value={form.timeline?.dispatchTime || form.dispatchTime} readOnly/></Field><div className="md:col-span-4"><IncidentLocationPicker value={form} locationText={form.timeline?.placeOfIncident || form.placeOfIncident} onChange={updateIncidentLocation}/></div></div></Section>
      </>}
      {step === 1 && <>
        <Section title="Scene Timeline"><div className="grid md:grid-cols-2 gap-3"><Field label="Arrival at Scene"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.arrivalScene || form.arrivalScene} onChange={e=>updateTimeline("arrivalScene",e.target.value)}/></Field><Field label="Departure at Scene"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.departureScene || form.departureScene} onChange={e=>updateTimeline("departureScene",e.target.value)}/></Field></div><div className="mt-3 rounded-lg bg-secondary p-2 text-xs text-muted-foreground">Scene to hospital travel: <b>{hospitalTravel || "Pending"}</b></div></Section>
        <Section title="Triage and Type of Emergency">
          <div className="space-y-4">
            <TriageButtons value={form.triage} onChange={v=>update("triage",v)}/>
            <div className="grid lg:grid-cols-[1fr_1fr_260px] gap-3">
              <div className="border border-border rounded-xl p-3 bg-secondary/20">
                <label className="flex gap-2 items-center text-sm font-bold mb-2">
                  <input type="checkbox" checked={form.emergencyTypes.includes("Medical")} onChange={() => update("emergencyTypes", form.emergencyTypes.includes("Medical") ? form.emergencyTypes.filter(x=>x!=="Medical") : [...form.emergencyTypes,"Medical"])} className="accent-blue-600"/>
                  MEDICAL
                </label>
                <CheckGroup options={emergencyTypes.filter(x=>x!=="Medical")} value={form.emergencyTypes} onChange={v=>updateIncidentTypeGroup("emergencyTypes",v)}/>
                {form.emergencyTypes.includes("Others") && <input className={`${input} mt-2`} placeholder="Others" value={form.emergencyOther} onChange={e=>update("emergencyOther",e.target.value)} required />}
              </div>
              <div className="border border-border rounded-xl p-3 bg-secondary/20">
                <label className="flex gap-2 items-center text-sm font-bold mb-2">
                  <input type="checkbox" checked={form.traumaTypes.includes("Trauma")} onChange={() => update("traumaTypes", form.traumaTypes.includes("Trauma") ? form.traumaTypes.filter(x=>x!=="Trauma") : [...form.traumaTypes,"Trauma"])} className="accent-red-600"/>
                  TRAUMA
                </label>
                <CheckGroup options={traumaTypes.filter(x=>x!=="Trauma")} value={form.traumaTypes} onChange={v=>updateIncidentTypeGroup("traumaTypes",v)}/>
                <div className="grid md:grid-cols-2 gap-2 mt-2">
                  {form.traumaTypes.includes("Assault") && <input className={input} placeholder="Assault: hacking, stabbing, shooting..." value={form.assaultDetails} onChange={e=>update("assaultDetails",e.target.value)}/>}
                  {form.traumaTypes.includes("Animal Bite") && <input className={input} placeholder="Animal bite: dog/cat/snake/others" value={form.animalBiteDetails} onChange={e=>update("animalBiteDetails",e.target.value)}/>}
                </div>
                {form.traumaTypes.includes("Others") && !form.emergencyTypes.includes("Others") && <input className={`${input} mt-2`} placeholder="Others" value={form.emergencyOther} onChange={e=>update("emergencyOther",e.target.value)} required />}
              </div>
              <div className="border border-border rounded-xl p-3 bg-card space-y-2">
                <Field label="Nature"><input className={input} placeholder="Self-inflicted / accidental" value={form.incidentNature} onChange={e=>update("incidentNature",e.target.value)}/></Field>
                <Field label="If ingestion"><input className={input} placeholder="Specify item" value={form.ingestionItem} onChange={e=>update("ingestionItem",e.target.value)}/></Field>
                <Field label="Quantity"><input className={input} value={form.ingestionQuantity} onChange={e=>update("ingestionQuantity",e.target.value)}/></Field>
                {form.traumaTypes.includes("Fall") && <Field label="If fall"><input className={input} value={form.fallDetails} onChange={e=>update("fallDetails",e.target.value)}/></Field>}
              </div>
            </div>
          </div>
        </Section>
        <Section title="Obstetric and Motor Vehicle Data">
          <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
            <div className="grid grid-cols-3 gap-2">{Object.keys(form.obstetric).map(k=><Field key={k} label={k.toUpperCase()}>{k === 'bow' ? <select className={input} value={form.obstetric.bow} onChange={e=>nested("obstetric","bow",e.target.value)} required><option value="">Select</option><option value="Positive">+</option><option value="Negative">-</option></select> : <input className={input} value={form.obstetric[k]} onChange={e=>nested("obstetric",k,e.target.value)}/>}</Field>)}</div>
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 border-b border-border">
                <label className="p-2 text-xs font-bold flex items-center gap-2 border-r border-border"><input type="checkbox" checked={form.crash.selfAccident} onChange={e=>nested("crash","selfAccident",e.target.checked)} className="accent-blue-600"/>SELF-ACCIDENT</label>
                <label className="p-2 text-xs font-bold flex items-center gap-2"><input type="checkbox" checked={form.crash.collision} onChange={e=>nested("crash","collision",e.target.checked)} className="accent-blue-600"/>COLLISION</label>
              </div>
              <div className="grid md:grid-cols-[1fr_1fr_.8fr] gap-2 p-3">
                <Field label="Vehicle Involved"><input className={input} value={form.crash.vehicle} onChange={e=>nested("crash","vehicle",e.target.value)}/></Field>
                <Field label="Driver / Passenger / Pedestrian"><input className={input} value={form.crash.role} onChange={e=>nested("crash","role",e.target.value)}/></Field>
                <Field label="Plate #"><input className={input} value={form.crash.plate} onChange={e=>nested("crash","plate",e.target.value)}/></Field>
                <Field label="Alcohol Breath"><select className={input} value={form.crash.alcohol} onChange={e=>nested("crash","alcohol",e.target.value)}><option/><option>Positive</option><option>Negative</option></select></Field>
                <Field label="Helmet"><select className={input} value={form.crash.helmet} onChange={e=>nested("crash","helmet",e.target.value)}><option/><option>Positive</option><option>Negative</option><option>N/A</option></select></Field>
                <Field label="Driver's License"><select className={input} value={form.crash.license} onChange={e=>nested("crash","license",e.target.value)}><option/><option>Positive</option><option>Negative</option><option>Not Applicable</option></select></Field>
              </div>
            </div>
          </div>
        </Section>
        <Section title="Chief Complaint, Vital Signs and Body Map"><Field label="Chief Complaint / Initial Assessment"><textarea rows="3" className={input} value={form.chiefComplaint} onChange={e=>update("chiefComplaint",e.target.value)}/></Field><div className="grid lg:grid-cols-[1.35fr_.65fr] gap-4 mt-4"><div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr>{["Time","Blood Pressure","Pulse Rate","Respiratory Rate","Temperature °C","Oxygen Saturation %",""] .map(x=><th className="border border-border p-2" key={x}>{x}</th>)}</tr></thead><tbody>{form.vitals.map(v=><tr key={v.id}>{["time","bp","pulse","respiratory","temperature","oxygen"].map(k=><td className="border border-border p-1" key={k}><input type={k==="time"?"time":"text"} className={`${input} min-w-24`} value={v[k]} onChange={e=>setVital(v.id,k,e.target.value)}/></td>)}<td className="border border-border p-1"><button onClick={()=>form.vitals.length>1&&update("vitals",form.vitals.filter(x=>x.id!==v.id))} className="text-red-500"><Trash2 size={15}/></button></td></tr>)}</tbody></table><button onClick={()=>update("vitals",[...form.vitals,newVital()])} className="mt-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs flex gap-1 items-center"><Plus size={14}/>Add vital-sign time row</button></div><button type="button" onClick={()=>setBodyOpen(true)} className="border-2 border-dashed border-blue-400 rounded-xl bg-white overflow-hidden hover:ring-4 ring-blue-500/20"><AnatomyFigure marks={form.bodyMap.marks} className="w-full"/><span className="block text-xs text-blue-600 font-semibold pb-2">Click to open body mapping editor</span></button></div></Section>
        <Section title="Glasgow Coma Scale"><div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr>{["Time","Eye Response","Verbal Response","Motor Response","Total",""].map(x=><th className="border border-border p-2" key={x}>{x}</th>)}</tr></thead><tbody>{gcsRows.map(row => { const rowTotal = Number(row.eye || 0) + Number(row.verbal || 0) + Number(row.motor || 0); return <tr key={row.id}>{["time","eye","verbal","motor"].map(key => <td className="border border-border p-1" key={key}>{key === "time" ? <input type="time" className={`${input} min-w-24`} value={row.time || ""} onChange={e=>setGcsRow(row.id,key,e.target.value)}/> : <select className={`${input} min-w-44`} value={row[key] || ""} onChange={e=>setGcsRow(row.id,key,e.target.value)}><option value="">Select</option>{GCS_OPTIONS[key].map(([name,score])=><option key={score} value={score}>{name} - {score}</option>)}</select>}</td>)}<td className="border border-border p-2 text-center font-black text-blue-500">{rowTotal || "-"}</td><td className="border border-border p-1"><button onClick={()=>gcsRows.length>1&&update("gcsRows",gcsRows.filter(item=>item.id!==row.id))} className="text-red-500 disabled:opacity-30" disabled={gcsRows.length<=1}><Trash2 size={15}/></button></td></tr>; })}</tbody></table><button onClick={()=>update("gcsRows",[...gcsRows,newGcsRow()])} className="mt-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs flex gap-1 items-center"><Plus size={14}/>Add GCS time row</button></div></Section>
      </>}
      {step === 2 && <>
        <Section title="Airway, Breathing and Circulation"><div className="space-y-4"><div><span className="text-xs font-semibold">Suspected spinal injury</span><RadioButtons options={["Yes","No"]} value={form.suspectedSpinal} onChange={v=>update("suspectedSpinal",v)}/></div><div className="grid md:grid-cols-2 gap-4"><div><span className="text-xs font-semibold">Airway</span><CheckGroup options={["Open Airway","Closed Airway","NT/OPA","Jaw Thrust","Suction","Finger Sweep","Abdominal Thrust"]} value={form.airway} onChange={v=>update("airway",v)} columns={2}/></div><div><span className="text-xs font-semibold">Breathing</span><CheckGroup options={["Positive","Negative","O2 Not Required","O2 Given","Nasal Cannula","Simple Mask","Non-Rebreather Mask","Others"]} value={form.breathing} onChange={updateBreathing} columns={2}/><div className="grid grid-cols-2 gap-2 mt-2"><input className={input} placeholder="O2 LPM" value={form.oxygenLpm} onChange={e=>update("oxygenLpm",e.target.value)}/>{form.breathing.includes("Others") && <input className={input} placeholder="Other O2 delivery" value={form.oxygenVia} onChange={e=>update("oxygenVia",e.target.value)} required />}</div></div></div><div className="grid md:grid-cols-2 gap-4"><div><span className="text-xs font-semibold">Pulse / Circulation</span><CheckGroup options={["Positive","Negative","Strong","Weak"]} value={form.pulseFindings} onChange={v=>update("pulseFindings",v)} columns={2}/></div><div className="grid grid-cols-3 gap-2"><Field label="Bleeding"><select className={input} value={form.bleeding} onChange={e=>update("bleeding",e.target.value)}><option/><option>Mild</option><option>Severe</option><option>None</option></select></Field><Field label="Location"><input className={input} value={form.bleedingLocation} onChange={e=>update("bleedingLocation",e.target.value)}/></Field><Field label="Controlled"><select className={input} value={form.bleedingControlled} onChange={e=>update("bleedingControlled",e.target.value)}><option/><option>Yes</option><option>No</option></select></Field></div></div><div className="grid md:grid-cols-3 gap-3"><div><span className="text-xs font-semibold">Capillary Refill</span><RadioButtons options={["Less than 2 seconds","More than 2 seconds"]} value={form.capillary} onChange={v=>update("capillary",v)}/></div><div><span className="text-xs font-semibold">Pupils</span><CheckGroup options={["Equal","Dilated","Constricted","No Reaction"]} value={form.pupils} onChange={v=>update("pupils",v)} columns={2}/></div><div><span className="text-xs font-semibold">Skin</span><CheckGroup options={["Warm","Cold","Dry","Moist","Pale","Flushed","Jaundiced"]} value={form.skin} onChange={v=>update("skin",v)} columns={2}/></div></div></div></Section>
        <Section title="Pain Assessment"><div className="grid md:grid-cols-3 gap-3"><div><RadioButtons options={["Positive","Negative"]} value={form.painPositive} onChange={v=>update("painPositive",v)}/></div><Field label="Pain Score 0-10"><input type="range" min="0" max="10" value={form.painScore||0} onChange={e=>update("painScore",e.target.value)} className="w-full"/><div className="text-center font-bold">{form.painScore||0}</div></Field><Field label="Onset"><select className={input} value={form.painOnset} onChange={e=>update("painOnset",e.target.value)}><option/><option>Sudden</option><option>Gradual</option></select></Field></div><CheckGroup options={["Crushing","Stabbing","Aching","Gnawing","Burning","Tearing","Cramping","Others"]} value={form.painQuality} onChange={v=>updateListWithOtherDetail("painQuality",v,"painOther")}/>{form.painQuality.includes("Others") && <input className={`${input} mt-2`} placeholder="Other pain description" value={form.painOther} onChange={e=>update("painOther",e.target.value)} required />}</Section>
        <Section title="Allergies, Medication and History"><div className="grid md:grid-cols-2 gap-4"><div className="space-y-2"><RadioButtons options={["With Allergies","No Allergies"]} value={form.allergies.status} onChange={v=>nested("allergies","status",v)}/>{[["Food","food"],["Drug","drug"],["Other","other"]].map(([l,k])=><Field key={k} label={`${l} Allergy`}><input className={input} value={form.allergies[k]} onChange={e=>nested("allergies",k,e.target.value)}/></Field>)}</div><div><div className="space-y-2">{form.medications.map((m,i)=><div key={i} className="grid grid-cols-3 gap-2"><input className={input} placeholder="Drug" value={m.drug} onChange={e=>setMedication(i,"drug",e.target.value)}/><input className={input} placeholder="Dose" value={m.dose} onChange={e=>setMedication(i,"dose",e.target.value)}/><input className={input} type="datetime-local" value={m.dateTime} onChange={e=>setMedication(i,"dateTime",e.target.value)}/></div>)}</div><button onClick={addMedication} className="text-xs text-blue-500 mt-2 flex gap-1"><Plus size={13}/>Add medication</button></div></div><div className="mt-4"><CheckGroup options={medicalHistory} value={form.medicalHistory} onChange={v=>updateListWithOtherDetail("medicalHistory",v,"medicalHistoryOther")}/>{form.medicalHistory.includes("Others") && <input className={`${input} mt-2`} placeholder="Other medical history" value={form.medicalHistoryOther} onChange={e=>update("medicalHistoryOther",e.target.value)} required />}</div></Section>
        <Section title="Hospitalization, Intake, Smoking, Alcohol and Events"><div className="grid md:grid-cols-3 gap-3"><Field label="Hospitalization Status"><select className={input} value={form.hospitalization.status} onChange={e=>nested("hospitalization","status",e.target.value)}><option/><option>Yes</option><option>None</option></select></Field><Field label="Last Confinement"><input type="date" className={input} value={form.hospitalization.date} onChange={e=>nested("hospitalization","date",e.target.value)}/></Field><Field label="Where"><input className={input} value={form.hospitalization.where} onChange={e=>nested("hospitalization","where",e.target.value)}/></Field><Field label="Due To"><input className={input} value={form.hospitalization.reason} onChange={e=>nested("hospitalization","reason",e.target.value)}/></Field><Field label="Last Oral Intake"><input className={input} value={form.oralIntake} onChange={e=>update("oralIntake",e.target.value)}/></Field><Field label="Intake Date and Time"><input type="datetime-local" className={input} value={form.oralIntakeDateTime} onChange={e=>update("oralIntakeDateTime",e.target.value)}/></Field><Field label="Smoking Status / sticks per day / stopped since"><input className={input} value={`${form.smoking.status} ${form.smoking.sticks} ${form.smoking.stopped}`} onChange={e=>nested("smoking","status",e.target.value)}/></Field><Field label="Alcohol Status"><input className={input} value={form.alcohol.status} onChange={e=>nested("alcohol","status",e.target.value)}/></Field><Field label="How Often"><input className={input} value={form.alcohol.frequency} onChange={e=>nested("alcohol","frequency",e.target.value)}/></Field><Field label="Events Prior to Injury" wide><textarea rows="3" className={input} value={form.eventsPrior} onChange={e=>update("eventsPrior",e.target.value)}/></Field></div></Section>
      </>}
      {step === 3 && <>
        <Section title="Intervention Checklist"><div className="grid md:grid-cols-2 gap-2">{INTERVENTIONS.map(item=><div key={item} className="grid grid-cols-[1fr_auto] items-center gap-2 border border-border rounded-lg p-2"><span className="text-xs">{item}</span><RadioButtons options={["Yes","No"]} value={form.interventions[item]} onChange={v=>updateInterventionResult(item,v)}/>{form.interventions[item] === "Yes" && ["Oxygen inhalation","Application of arm sling","Placed in recovery position","Others"].includes(item)&&<input className={`${input} col-span-2`} placeholder="Details" value={form.interventionDetails[item]||""} onChange={e=>update("interventionDetails",{...form.interventionDetails,[item]:e.target.value})} required={item === "Others"}/>}</div>)}</div></Section>
        <Section title="Hospital Endorsement and Transfer"><div className="mb-4"><span className="mb-2 block text-xs font-semibold text-muted-foreground">Does the patient need hospitalization?</span><RadioButtons options={["Yes","None"]} value={form.hospitalization?.status || ""} onChange={value=>nested("hospitalization","status",value)}/></div>{needsHospital && <div className="grid md:grid-cols-3 gap-3"><Field label="Reason for Transfer / Not Admitting" wide><textarea className={input} rows="3" value={form.transferReason} onChange={e=>update("transferReason",e.target.value)}/></Field><Field label="Hospital / Facility"><input className={input} value={form.hospitalName} onChange={e=>update("hospitalName",e.target.value)}/></Field><Field label="Resident on Duty"><input className={input} value={form.residentOnDuty} onChange={e=>update("residentOnDuty",e.target.value)}/></Field><Field label="Date"><input type="date" className={input} value={form.hospitalDate} onChange={e=>update("hospitalDate",e.target.value)}/></Field><Field label="Arrival Endorsement Time"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.endorsementTime || form.endorsementTime || form.hospitalTime || form.arrivalHospital} onChange={e=>updateHospitalArrival(e.target.value)}/><span className="block text-[10px] text-muted-foreground mt-1">Entering this automatically fills Arrival at Hospital.</span></Field><Field label="Arrival at Hospital"><input type="time" className={input} value={form.timeline?.arrivalHospital || form.arrivalHospital} readOnly/></Field><Field label="Consent for Care"><input className={input} value={form.consentForCare} onChange={e=>update("consentForCare",e.target.value)}/></Field><Field label="Endorsed To"><input className={input} value={form.endorsedTo} onChange={e=>update("endorsedTo",e.target.value)}/></Field><Field label="Received By"><input className={input} value={form.receivedBy} onChange={e=>update("receivedBy",e.target.value)}/></Field><Field label="Hospital"><input className={input} value={form.endorsementHospital} onChange={e=>update("endorsementHospital",e.target.value)}/></Field><Field label="Receiver Name"><input className={input} value={form.receiverName} onChange={e=>update("receiverName",e.target.value)}/></Field><Field label="Receiver Position"><input className={input} value={form.receiverPosition} onChange={e=>update("receiverPosition",e.target.value)}/></Field><Field label="Receiver Contact Number"><input className={input} value={form.receiverContact} onChange={e=>update("receiverContact",e.target.value)}/></Field><label className="md:col-span-3 flex gap-3 items-start p-3 border border-border rounded-lg bg-secondary/30"><input type="checkbox" checked={form.receiverConfirmed} onChange={e=>update("receiverConfirmed",e.target.checked)} className="mt-1 accent-blue-600"/><span className="text-xs"><b>Confirm hospital handover</b><br/>Receiver details are complete and the handover has been acknowledged. Departure at Hospital remains editable in this step.</span></label><Field label="Departure at Hospital"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.departureHospital || form.departureHospital} onChange={e=>updateTimeline("departureHospital",e.target.value)}/></Field><Field label="Valuables Endorsed" wide><textarea className={input} value={form.valuables} onChange={e=>update("valuables",e.target.value)}/></Field><Field label="Valuables Received By"><input className={input} value={form.valuablesReceivedBy} onChange={e=>update("valuablesReceivedBy",e.target.value)}/></Field><Field label="Receiver Contact"><input className={input} value={form.valuablesContact} onChange={e=>update("valuablesContact",e.target.value)}/></Field></div>}</Section>
        <Section title="Waiver / Refusal of Treatment or Transport"><label className="flex gap-3 items-start p-3 border border-border rounded-lg"><input type="checkbox" checked={form.waiverAccepted} onChange={e=>update("waiverAccepted",e.target.checked)} className="mt-1 accent-blue-600"/><span className="text-xs leading-relaxed">The patient/victim acknowledges that refusal of treatment or transport may result in death or imperil health, assumes the risks and consequences, and releases the emergency services crew from liability arising from the refusal.</span></label><Field label="Reason for refusal"><textarea className={`${input} mt-3`} rows="2" value={form.waiverReason} onChange={e=>update("waiverReason",e.target.value)}/></Field><div className="grid md:grid-cols-3 gap-4 mt-4">{[["Patient","patient"],["Witness 1","witness1"],["Witness 2","witness2"]].map(([l,k])=><div key={k}><SignaturePad label={`${l} Signature`} value={form.signatures[k]} onChange={v=>signature(k,v)}/><input className={`${input} mt-2`} placeholder="Printed name" value={form.signatureNames[k]} onChange={e=>signatureName(k,e.target.value)}/><input type="datetime-local" className={`${input} mt-2`} value={form.signatureDates[k]} onChange={e=>signatureDate(k,e.target.value)}/></div>)}</div></Section>
        <Section title="Digital Documentation"><div className="grid md:grid-cols-2 gap-4"><div><SignaturePad label="Report Annotation (stylus / touch)" value={form.annotation} onChange={v=>update("annotation",v)}/></div><div><label className="h-36 border-2 border-dashed border-blue-400 rounded-xl flex flex-col items-center justify-center cursor-pointer bg-blue-500/5"><Camera className="text-blue-500 mb-2"/><span className="text-sm font-semibold">Upload geotagged photos or documents</span><span className="text-xs text-muted-foreground">Location is requested at upload time</span><input type="file" multiple accept="image/*,.pdf" onChange={upload} className="hidden"/></label><div className="mt-2 space-y-1">{form.attachments.map(a=><div key={a.id} className="text-xs flex justify-between border border-border rounded p-2"><span>{a.name}</span><span className="text-muted-foreground flex gap-1 items-center"><MapPin size={11}/>{a.location?`${a.location.lat.toFixed(5)}, ${a.location.lng.toFixed(5)}`:"No location"}</span></div>)}</div></div></div><Field label="Additional Notes"><textarea className={`${input} mt-3`} rows="3" value={form.notes} onChange={e=>update("notes",e.target.value)}/></Field><div className="grid md:grid-cols-3 gap-3 mt-3"><Field label="Back to Base"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.backToBase || form.backToBase} onChange={e=>updateTimeline("backToBase",e.target.value)}/></Field><div className="md:col-span-2 rounded-lg bg-secondary p-2 text-xs text-muted-foreground self-end">Hospital to base travel: <b>{returnTravel || "Pending"}</b></div></div></Section>
      </>}
      {step === 4 && <Section title="Review and Submit"><div className="grid md:grid-cols-3 gap-3 mb-4">{[["Response",form.responseNumber],["Patient",form.patientName],["Incident",formatDateAndTime(form.dateOfIncident, form.timeOfIncident)],["Triage",form.triage],["GCS",gcsTotal||"Not scored"],["Hospital",form.hospitalName||"Not specified"]].map(([l,v])=><div className="p-3 bg-secondary rounded-lg" key={l}><div className="text-[10px] uppercase text-muted-foreground">{l}</div><div className="font-semibold text-sm">{v||"Not entered"}</div></div>)}</div><div className="mb-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Complete Incident Timeline</h4><TimelineSummary timeline={form.timeline || form}/></div><button type="button" onClick={()=>setReviewOpen(true)} className="w-full group relative border border-border bg-white overflow-hidden rounded-xl max-h-[650px] cursor-zoom-in text-left" aria-label="Open detailed PCR report review"><div className="sticky top-3 z-10 flex justify-end px-3 pointer-events-none"><span className="flex items-center gap-2 rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-semibold shadow-lg group-hover:bg-blue-500"><Maximize2 size={15}/>Open detailed review</span></div><div className="origin-top scale-[.72] md:scale-90 -mt-8"><PrintablePCR record={form}/></div></button><p className="text-xs text-muted-foreground mt-2 text-center">Click the report preview to open it, zoom in, and review all details.</p><div className="flex flex-wrap justify-end gap-2 mt-4"><button onClick={()=>store("Draft")} disabled={Boolean(savingStatus)} className="px-4 py-2 bg-secondary rounded-lg flex gap-2 text-sm disabled:opacity-60"><Save size={15}/>{savingStatus === "Draft" ? "Saving..." : "Save Draft"}</button><button onClick={downloadPdf} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex gap-2 text-sm"><Download size={15}/>Download PDF</button><button onClick={()=>store("Submitted")} disabled={Boolean(savingStatus)} className="px-5 py-2 bg-green-600 text-white rounded-lg flex gap-2 text-sm disabled:opacity-60"><CheckCircle2 size={15}/>{savingStatus === "Submitted" ? "Submitting..." : "Submit PCR"}</button></div></Section>}
    </div>
    <div className="flex justify-between mt-5"><button disabled={step===0} onClick={()=>setStep(s=>s-1)} className="px-4 py-2 bg-secondary rounded-lg disabled:opacity-40 flex gap-2 items-center"><ArrowLeft size={15}/>Previous</button><button disabled={step===steps.length-1} onClick={goNext} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-40 flex gap-2 items-center">Next<ArrowRight size={15}/></button></div>
    {bodyOpen&&<AnatomyEditor value={form.bodyMap} onClose={()=>setBodyOpen(false)} onSave={value=>{update("bodyMap",value);setBodyOpen(false);}}/>}{reviewOpen&&<DetailedPCRReview record={form} onClose={()=>setReviewOpen(false)}/>}<PrintablePCR record={form} printOnly/>
  </div>;
}
