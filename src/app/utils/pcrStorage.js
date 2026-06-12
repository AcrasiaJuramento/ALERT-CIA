export const PCR_STORAGE_KEY = "alert-cia-pcr-records";
export const PCR_EDIT_KEY = "alert-cia-pcr-edit-id";
export const PCR_AUDIT_KEY = "alert-cia-pcr-audit-log";
export const CURRENT_USER = { id: "officer-roberto-aquino", name: "Cpl. Roberto Aquino", role: "officer" };

export const newVital = () => ({ id: crypto.randomUUID(), time: "", bp: "", pulse: "", respiratory: "", temperature: "", oxygen: "" });

export const createPCR = () => ({
  id: crypto.randomUUID(), responseNumber: `PCR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
  status: "Draft", archived: false, createdBy: CURRENT_USER.id, updatedBy: CURRENT_USER.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  respondingTeam: "", vehicle: "", driver: "", mainAider: "", assistantAider: "", natureOfCall: "Emergency",
  dateOfIncident: new Date().toISOString().slice(0, 10), timeOfIncident: "", placeOfIncident: "",
  dispatchTime: "", arrivalScene: "", departureScene: "", arrivalHospital: "", departureHospital: "", backToBase: "",
  patientName: "", age: "", birthday: "", gender: "", civilStatus: "", address: "", contactPerson: "", contactNumber: "",
  triage: "", emergencyTypes: [], traumaTypes: [], emergencyOther: "", assaultDetails: "", animalBiteDetails: "",
  incidentNature: "", ingestionItem: "", ingestionQuantity: "", fallDetails: "",
  obstetric: { lmp: "", g: "", p: "", edc: "", bow: "", aog: "", baby: "", ie: "", placenta: "" },
  crash: { selfAccident: false, collision: false, vehicle: "", role: "", plate: "", alcohol: "", helmet: "", license: "" },
  chiefComplaint: "", vitals: [newVital()], gcs: { eye: "", verbal: "", motor: "" },
  bodyMap: { image: "", marks: [] }, suspectedSpinal: "", airway: [], breathing: [], oxygenLpm: "", oxygenVia: "",
  pulseFindings: [], bleeding: "", bleedingLocation: "", bleedingControlled: "", capillary: "", pupils: [], skin: [],
  painPositive: "", painScore: "", painOnset: "", painQuality: [], painOther: "",
  allergies: { status: "", food: "", drug: "", other: "" }, medications: [{ drug: "", dose: "", dateTime: "" }],
  medicalHistory: [], medicalHistoryOther: "", hospitalization: { status: "", date: "", where: "", reason: "" },
  oralIntake: "", oralIntakeDateTime: "", smoking: { status: "", sticks: "", stopped: "" }, alcohol: { status: "", frequency: "" },
  eventsPrior: "", interventions: {}, interventionDetails: {}, hospitalName: "", transferReason: "", residentOnDuty: "",
  hospitalDate: "", hospitalTime: "", consentForCare: "", endorsedTo: "", receivedBy: "", endorsementHospital: "",
  endorsementDate: "", endorsementTime: "", transferArrivalTime: "", receiverName: "", receiverPosition: "", receiverContact: "",
  receiverConfirmed: false, departureHospitalGeneratedAt: "", valuables: "", valuablesReceivedBy: "", valuablesContact: "",
  waiverAccepted: false, waiverReason: "", signatures: { consent: "", patient: "", witness1: "", witness2: "", resident: "", receiver: "" },
  signatureNames: { consent: "", patient: "", witness1: "", witness2: "", resident: "", receiver: "" },
  signatureDates: { patient: "", witness1: "", witness2: "" }, annotation: "", attachments: [], notes: ""
});

export function loadPCRs() {
  try {
    return JSON.parse(localStorage.getItem(PCR_STORAGE_KEY) || "[]").map(record => ({
      ...record,
      createdBy: record.createdBy || CURRENT_USER.id,
      updatedBy: record.updatedBy || record.createdBy || CURRENT_USER.id,
    }));
  } catch { return []; }
}

export function loadAuditLogs(reportId) {
  try {
    const logs = JSON.parse(localStorage.getItem(PCR_AUDIT_KEY) || "[]");
    return reportId ? logs.filter(log => log.reportId === reportId) : logs;
  } catch { return []; }
}

export function addAuditLog(reportId, actionType, previousValue, newValue) {
  const logs = loadAuditLogs();
  logs.unshift({ id: crypto.randomUUID(), reportId, userId: CURRENT_USER.id, actionType, previousValue, newValue, timestamp: new Date().toISOString() });
  localStorage.setItem(PCR_AUDIT_KEY, JSON.stringify(logs));
}

export function synchronizePCR(record) {
  const next = { ...record };
  if (next.arrivalHospital) {
    next.hospitalTime = next.arrivalHospital;
    next.endorsementTime = next.arrivalHospital;
    next.transferArrivalTime = next.arrivalHospital;
    next.hospitalDate = next.hospitalDate || next.dateOfIncident;
    next.endorsementDate = next.endorsementDate || next.dateOfIncident;
  }
  const receiverComplete = next.receiverName?.trim() && next.receiverPosition?.trim() && next.receiverContact?.trim() && next.receiverConfirmed;
  if (receiverComplete && !next.departureHospital) {
    const now = new Date();
    next.departureHospital = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    next.departureHospitalGeneratedAt = now.toISOString();
  }
  return next;
}

export function validateChronology(record) {
  const timeline = [
    ["Arrival at Scene", record.arrivalScene],
    ["Departure from Scene", record.departureScene],
    ["Arrival at Hospital", record.arrivalHospital],
    ["Departure from Hospital", record.departureHospital],
    ["Back to Base", record.backToBase],
  ].filter(([, value]) => value);
  for (let index = 1; index < timeline.length; index += 1) {
    if (timeline[index][1] < timeline[index - 1][1]) return `${timeline[index][0]} cannot be earlier than ${timeline[index - 1][0]}.`;
  }
  return "";
}

export function travelDuration(start, end) {
  if (!start || !end || end < start) return "";
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function savePCR(record) {
  const records = loadPCRs();
  const previous = records.find(item => item.id === record.id);
  const next = { ...synchronizePCR(record), createdBy: record.createdBy || CURRENT_USER.id, updatedBy: CURRENT_USER.id, updatedAt: new Date().toISOString() };
  const index = records.findIndex(item => item.id === next.id);
  if (index >= 0) records[index] = next; else records.unshift(next);
  localStorage.setItem(PCR_STORAGE_KEY, JSON.stringify(records));
  if (!previous) addAuditLog(next.id, "REPORT_CREATED", null, { status: next.status });
  else {
    if (previous.status !== next.status) addAuditLog(next.id, "STATUS_CHANGED", previous.status, next.status);
    ["arrivalHospital", "departureHospital", "backToBase"].forEach(key => {
      if (previous[key] !== next[key]) addAuditLog(next.id, "TIMESTAMP_MODIFIED", { field: key, value: previous[key] }, { field: key, value: next[key] });
    });
    if (previous.endorsedTo !== next.endorsedTo || previous.receivedBy !== next.receivedBy) {
      addAuditLog(next.id, "HOSPITAL_ENDORSEMENT_UPDATED", { endorsedTo: previous.endorsedTo, receivedBy: previous.receivedBy }, { endorsedTo: next.endorsedTo, receivedBy: next.receivedBy });
    }
    addAuditLog(next.id, "REPORT_EDITED", { updatedAt: previous.updatedAt }, { updatedAt: next.updatedAt });
  }
  return next;
}

export function setPCRs(records) { localStorage.setItem(PCR_STORAGE_KEY, JSON.stringify(records)); }

export const printPCR = () => setTimeout(() => window.print(), 50);

export async function exportPCRToDocx(record) {
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const text = value => String(value || "Not recorded");
  const detailRow = (label, value) => new TableRow({ children: [
    new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
    new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE }, children: [new Paragraph(text(value))] }),
  ] });
  const sections = [
    ["Report", [["Response Number", record.responseNumber], ["Status", record.status], ["Created By", record.createdBy], ["Incident Date", `${record.dateOfIncident} ${record.timeOfIncident}`]]],
    ["Patient", [["Name", record.patientName], ["Age / Gender", `${record.age} / ${record.gender}`], ["Address", record.address], ["Contact", record.contactNumber]]],
    ["Response Timeline", [["Dispatch", record.dispatchTime], ["Arrival Scene", record.arrivalScene], ["Departure Scene", record.departureScene], ["Arrival Hospital", record.arrivalHospital], ["Departure Hospital", record.departureHospital], ["Back to Base", record.backToBase]]],
    ["Clinical Assessment", [["Triage", record.triage], ["Chief Complaint", record.chiefComplaint], ["GCS", Object.values(record.gcs || {}).reduce((sum, score) => sum + Number(score || 0), 0)], ["Interventions", Object.entries(record.interventions || {}).filter(([, value]) => value === "Yes").map(([name]) => name).join(", ")]]],
    ["Hospital Handover", [["Facility", record.hospitalName], ["Endorsed To", record.endorsedTo], ["Receiver", `${record.receiverName} - ${record.receiverPosition}`], ["Receiver Contact", record.receiverContact], ["Transfer Reason", record.transferReason]]],
  ];
  const children = [
    new Paragraph({ text: "ALERT-CIA PATIENT CARE REPORT", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: "Official EMS Documentation", alignment: "center" }),
    ...sections.flatMap(([title, rows]) => [
      new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map(([label, value]) => detailRow(label, value)) }),
      new Paragraph(""),
    ]),
  ];
  const blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${record.responseNumber || "PCR-report"}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const GCS_OPTIONS = {
  eye: [["Spontaneously", 4], ["To Speech", 3], ["To Pain", 2], ["No Response", 1]],
  verbal: [["Oriented", 5], ["Confused", 4], ["Inappropriate Words", 3], ["Incomprehensible Sounds", 2], ["No Response", 1]],
  motor: [["Obeys Command", 6], ["Localizes Pain", 5], ["Withdraws from Pain", 4], ["Abnormal Flexion", 3], ["Abnormal Extension", 2], ["No Response", 1]],
};

export const INTERVENTIONS = [
  "Vital signs monitored and recorded", "Wound care given", "Wound dressing applied", "Application of C-Collar",
  "Oxygen inhalation", "CPR / compression / rescue breathing / AED", "Suctioning", "Sponge bath", "Cold pack / hot pack",
  "Application of wood splint/s", "Application of arm sling", "Application of traction splint", "Application of KED",
  "Elastic / triangular bandage", "Loaded on a spine board", "Placed in recovery position", "Endorsement to relative / PNP",
  "Conveyance and endorsement to HOC", "Others"
];
