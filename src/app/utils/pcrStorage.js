export const PCR_STORAGE_KEY = "alert-cia-pcr-records";
export const PCR_EDIT_KEY = "alert-cia-pcr-edit-id";

export const newVital = () => ({ id: crypto.randomUUID(), time: "", bp: "", pulse: "", respiratory: "", temperature: "", oxygen: "" });

export const createPCR = () => ({
  id: crypto.randomUUID(), responseNumber: `PCR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
  status: "Draft", archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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
  endorsementDate: "", endorsementTime: "", valuables: "", valuablesReceivedBy: "", valuablesContact: "",
  waiverAccepted: false, waiverReason: "", signatures: { consent: "", patient: "", witness1: "", witness2: "", resident: "", receiver: "" },
  signatureNames: { consent: "", patient: "", witness1: "", witness2: "", resident: "", receiver: "" },
  signatureDates: { patient: "", witness1: "", witness2: "" }, annotation: "", attachments: [], notes: ""
});

export function loadPCRs() {
  try { return JSON.parse(localStorage.getItem(PCR_STORAGE_KEY) || "[]"); } catch { return []; }
}

export function savePCR(record) {
  const records = loadPCRs();
  const next = { ...record, updatedAt: new Date().toISOString() };
  const index = records.findIndex(item => item.id === next.id);
  if (index >= 0) records[index] = next; else records.unshift(next);
  localStorage.setItem(PCR_STORAGE_KEY, JSON.stringify(records));
  return next;
}

export function setPCRs(records) { localStorage.setItem(PCR_STORAGE_KEY, JSON.stringify(records)); }

export const printPCR = () => setTimeout(() => window.print(), 50);

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
