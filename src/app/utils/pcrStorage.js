export const PCR_EDIT_KEY = "alert-cia-pcr-edit-id";

export const newVital = () => ({ id: crypto.randomUUID(), time: "", bp: "", pulse: "", respiratory: "", temperature: "", oxygen: "" });

export const createPCR = () => ({
  dispatchId: null,
  id: crypto.randomUUID(), responseNumber: `PCR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
  status: "Draft", archived: false, createdBy: null, updatedBy: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  respondingTeam: "", vehicle: "", driver: "", mainAider: "", assistantAider: "", natureOfCall: "Emergency",
  dateOfIncident: new Date().toISOString().slice(0, 10), timeOfIncident: "", placeOfIncident: "",
  dispatchTime: "", arrivalScene: "", departureScene: "", arrivalHospital: "", departureHospital: "", backToBase: "",
  timeline: {
    dateOfIncident: new Date().toISOString().slice(0, 10), timeOfIncident: "", placeOfIncident: "",
    dispatchTime: "", arrivalScene: "", departureScene: "", endorsementTime: "",
    arrivalHospital: "", departureHospital: "", backToBase: "",
  },
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

export function synchronizePCR(record) {
  const template = createPCR();
  const next = {
    ...template,
    ...record,
    timeline: { ...template.timeline, ...(record.timeline || {}) },
    obstetric: { ...template.obstetric, ...(record.obstetric || {}) },
    crash: { ...template.crash, ...(record.crash || {}) },
    gcs: { ...template.gcs, ...(record.gcs || {}) },
    bodyMap: { ...template.bodyMap, ...(record.bodyMap || {}), marks: record.bodyMap?.marks || template.bodyMap.marks },
    allergies: { ...template.allergies, ...(record.allergies || {}) },
    hospitalization: { ...template.hospitalization, ...(record.hospitalization || {}) },
    smoking: { ...template.smoking, ...(record.smoking || {}) },
    alcohol: { ...template.alcohol, ...(record.alcohol || {}) },
    signatures: { ...template.signatures, ...(record.signatures || {}) },
    signatureNames: { ...template.signatureNames, ...(record.signatureNames || {}) },
    signatureDates: { ...template.signatureDates, ...(record.signatureDates || {}) },
    vitals: record.vitals?.length ? record.vitals : template.vitals,
    emergencyTypes: record.emergencyTypes || template.emergencyTypes,
    traumaTypes: record.traumaTypes || template.traumaTypes,
    airway: record.airway || template.airway,
    breathing: record.breathing || template.breathing,
    pulseFindings: record.pulseFindings || template.pulseFindings,
    pupils: record.pupils || template.pupils,
    skin: record.skin || template.skin,
    painQuality: record.painQuality || template.painQuality,
    medications: record.medications?.length ? record.medications : template.medications,
    medicalHistory: record.medicalHistory || template.medicalHistory,
    interventions: record.interventions || template.interventions,
    interventionDetails: record.interventionDetails || template.interventionDetails,
    attachments: record.attachments || template.attachments,
  };
  ["dateOfIncident", "timeOfIncident", "placeOfIncident", "dispatchTime", "arrivalScene", "departureScene", "arrivalHospital", "departureHospital", "backToBase"].forEach(key => {
    next.timeline[key] = next.timeline[key] || next[key] || "";
    next[key] = next.timeline[key] ?? next[key] ?? "";
  });
  next.timeline.endorsementTime = next.timeline.endorsementTime || next.endorsementTime || next.hospitalTime || next.arrivalHospital || "";
  if (next.arrivalHospital) {
    next.hospitalTime = next.arrivalHospital;
    next.endorsementTime = next.arrivalHospital;
    next.timeline.endorsementTime = next.arrivalHospital;
    next.transferArrivalTime = next.arrivalHospital;
    next.hospitalDate = next.hospitalDate || next.dateOfIncident;
    next.endorsementDate = next.endorsementDate || next.dateOfIncident;
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

export async function exportPCRToPdf(record) {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const source = [...document.querySelectorAll(".pcr-print-source")]
    .find(element => element.dataset.pcrExportId === record.id);
  if (!source) throw new Error("PCR export layout is not available.");

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const pages = [...source.querySelectorAll(".pcr-page")];
  if (!pages.length) throw new Error("PCR export pages are not available.");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let index = 0; index < pages.length; index += 1) {
    const canvas = await html2canvas(pages[index], {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    if (index > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pageWidth - width) / 2, 0, width, height, undefined, "FAST");
  }

  pdf.save(`${record.responseNumber || "PCR-report"}.pdf`);
}

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
