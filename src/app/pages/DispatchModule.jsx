import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Save, Download, Plus, Trash2, FileText, Radio, Clock, Users, Phone, CheckCircle2, Send
} from "lucide-react";
import { toast } from "sonner";
import {
  DISPATCH_EDIT_KEY,
  DISPATCH_STATUSES,
  findLinkedPCR,
  generateResponseNumber,
  loadDispatchRecords,
  RESPONDING_TEAMS,
  saveDispatchForm,
  sendDispatchToRespondingTeam,
} from "../utils/dispatchWorkflow";

// ─── Shared style tokens ────────────────────────────────────────────────────
const input = "w-full px-3 py-2 bg-input-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500";
const smallInput = "w-full px-2 py-1.5 bg-input-background border border-border rounded-md text-foreground text-xs focus:outline-none focus:border-blue-500";

// ─── Field wrapper ───────────────────────────────────────────────────────────
function Field({ label, children, wide = false, className = "" }) {
  return (
    <label className={`${wide ? "md:col-span-2" : ""} ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <h3 className="px-4 py-2.5 bg-secondary flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wide">
        {icon && <span className="text-blue-500">{icon}</span>}
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ─── Checkbox item ───────────────────────────────────────────────────────────
function CB({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-blue-600 shrink-0" />
      <span>{label}</span>
    </label>
  );
}

// ─── Assistance needed checkboxes ────────────────────────────────────────────
const ASSISTANCE_OPTIONS = ["PNP", "BFP", "BRGY. OFFICIALS", "OTHERS"];
const MEDICAL_TYPES = ["Conduction", "Transport", "Transfer", "Medical", "Pediatric", "Psychiatric", "Surgical", "Obstetrical", "Drowning"];
const TRAUMA_TYPES = ["Trauma", "Fall", "Electrocution", "Domestic Violence", "Water Rescue Incident", "Fire Incident", "Motor Vehicle Crash"];

// ─── Default patient record ──────────────────────────────────────────────────
function newPatient() {
  return {
    id: crypto.randomUUID(),
    name: "", age: "", birthdate: "", gender: "", address: "",
    assessmentFindings: "",
    bp: "", pr: "", rr: "", temp: "", o2Sat: "", gcs: "",
    conscious: false, unconscious: false, ambulatory: false, nonAmbulatory: false,
    // If Vehicular Accident
    driver: false, passenger: false, pedestrian: false,
    helmet: "", alcoholBreath: "", driversLicense: "",
    // If Pregnant
    g: "", p: "", t: "", pa: "", l: "",
    lmp: "", aog: "", edc: "", fht: "", ie: "", bow: "",
  };
}

// ─── Default dispatch form ───────────────────────────────────────────────────
function newDispatch() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: DISPATCH_STATUSES.DRAFT,
    // Header
    responseNumber: generateResponseNumber(),
    numberOfPatients: "1",
    team: "",
    vehicle: "",
    driver: "",
    groupLeader: "",
    assistantAider: "",
    // Caller data
    callerName: "",
    callerAddress: "",
    callerContact: "",
    // Nature of call
    natureTypes: [],
    assaultDetails: "",
    animalBiteDetails: "",
    otherMedical: "",
    otherTrauma: "",
    selfAccident: false,
    collision: false,
    vehicleInvolved: "",
    incidentNature: "Self-Inflicted",
    ifIngestion: "",
    quantity: "",
    ifFall: "",
    placeOfIncident: "",
    barangay: "",
    timeOfIncident: "",
    dateOfIncident: "",
    assistanceNeeded: [],
    assistanceOther: "",
    // Timeline
    dispatchedTime: "",
    arrivalScene: "",
    departureScene: "",
    arrivalHospital: "",
    departureHospital: "",
    arrivalOffice: "",
    nameOfHospital: "",
    // Dispatcher
    dispatcher: "",
    date: "",
    // Patients (up to 3)
    patients: [newPatient()],
  };
}

// ─── Timeline row ────────────────────────────────────────────────────────────
function TimelineField({ label, value, onChange, error }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="time"
        className={`${smallInput} ${error ? "border-red-500/60" : ""}`}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ─── Patient card ────────────────────────────────────────────────────────────
function PatientCard({ patient, index, onChange, onRemove, canRemove }) {
  const up = (key, val) => onChange({ ...patient, [key]: val });
  const toggle = key => onChange({ ...patient, [key]: !patient[key] });

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-secondary/60 flex items-center justify-between">
        <span className="text-sm font-bold text-foreground flex items-center gap-2">
          <Users size={14} className="text-blue-500" />
          Patient / Victim #{index + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-red-500 hover:text-red-400 p-1 rounded">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        {/* Basic info */}
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Patient Name" wide>
            <input className={input} value={patient.name} onChange={e => up("name", e.target.value)} />
          </Field>
          <Field label="Age">
            <input type="number" className={input} value={patient.age} onChange={e => up("age", e.target.value)} />
          </Field>
          <Field label="Birthday">
            <input type="date" className={input} value={patient.birthdate} onChange={e => up("birthdate", e.target.value)} />
          </Field>
          <Field label="Gender">
            <select className={input} value={patient.gender} onChange={e => up("gender", e.target.value)}>
              <option value="">Select</option>
              {["Male", "Female", "Other"].map(x => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Patient Address" wide>
            <input className={input} value={patient.address} onChange={e => up("address", e.target.value)} />
          </Field>
        </div>

        {/* Assessment findings */}
        <Field label="Assessment Findings">
          <textarea rows="3" className={input} value={patient.assessmentFindings} onChange={e => up("assessmentFindings", e.target.value)} />
        </Field>

        {/* Vital signs */}
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vital Signs</span>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[["BP", "bp"], ["PR", "pr"], ["RR", "rr"], ["Temp", "temp"], ["O₂ Sat", "o2Sat"], ["GCS", "gcs"]].map(([lbl, key]) => (
              <Field key={key} label={lbl}>
                <input className={smallInput} value={patient[key]} onChange={e => up(key, e.target.value)} />
              </Field>
            ))}
          </div>
        </div>

        {/* General status */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">General Status</span>
            <div className="grid grid-cols-2 gap-2">
              <CB label="Conscious" checked={patient.conscious} onChange={() => toggle("conscious")} />
              <CB label="Unconscious" checked={patient.unconscious} onChange={() => toggle("unconscious")} />
              <CB label="Ambulatory" checked={patient.ambulatory} onChange={() => toggle("ambulatory")} />
              <CB label="Non-Ambulatory" checked={patient.nonAmbulatory} onChange={() => toggle("nonAmbulatory")} />
            </div>
          </div>
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">If Vehicular Accident</span>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <CB label="Driver" checked={patient.driver} onChange={() => toggle("driver")} />
              <CB label="Passenger" checked={patient.passenger} onChange={() => toggle("passenger")} />
              <CB label="Pedestrian" checked={patient.pedestrian} onChange={() => toggle("pedestrian")} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["Helmet", "helmet"], ["Alcohol Breath", "alcoholBreath"], ["Driver's License", "driversLicense"]].map(([lbl, key]) => (
                <Field key={key} label={`${lbl} (+/-)`}>
                  <select className={smallInput} value={patient[key]} onChange={e => up(key, e.target.value)}>
                    <option value="" />
                    <option>+</option>
                    <option>-</option>
                  </select>
                </Field>
              ))}
            </div>
          </div>
        </div>

        {/* If Pregnant */}
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">If Pregnant</span>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[["G", "g"], ["P", "p"], ["T", "t"], ["P(A)", "pa"], ["A", "a"], ["L", "l"]].map(([lbl, key]) => (
              <Field key={key} label={lbl}>
                <input className={smallInput} value={patient[key] || ""} onChange={e => up(key, e.target.value)} />
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
            {[["LMP", "lmp"], ["AOG", "aog"], ["EDC", "edc"], ["FHT", "fht"], ["IE", "ie"]].map(([lbl, key]) => (
              <Field key={key} label={lbl}>
                <input className={smallInput} value={patient[key]} onChange={e => up(key, e.target.value)} />
              </Field>
            ))}
            <Field label="BOW (+/-)">
              <select className={smallInput} value={patient.bow} onChange={e => up("bow", e.target.value)}>
                <option value="" />
                <option>+</option>
                <option>-</option>
              </select>
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Nature toggle helper ────────────────────────────────────────────────────
// ─── Main Dispatch Module ────────────────────────────────────────────────────
export default function DispatchModule({ onBack }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState(() => {
    const id = params.get("edit") || sessionStorage.getItem(DISPATCH_EDIT_KEY);
    const found = id ? loadDispatchRecords().find(item => item.id === id) : null;
    sessionStorage.removeItem(DISPATCH_EDIT_KEY);
    return found ? { ...newDispatch(), ...found, responseNumber: found.responseNumber || generateResponseNumber(), patients: found.patients?.length ? found.patients : [newPatient()] } : newDispatch();
  });
  const [saved, setSaved] = useState("");
  const linkedPCR = useMemo(() => findLinkedPCR(form), [form]);

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const toggleNature = (type) => {
    const current = form.natureTypes;
    update("natureTypes", current.includes(type) ? current.filter(x => x !== type) : [...current, type]);
  };
  const toggleAssistance = (opt) => {
    const current = form.assistanceNeeded;
    update("assistanceNeeded", current.includes(opt) ? current.filter(x => x !== opt) : [...current, opt]);
  };

  const addPatient = () => {
    if (form.patients.length < 3) update("patients", [...form.patients, newPatient()]);
  };
  const removePatient = (id) => {
    if (form.patients.length > 1) update("patients", form.patients.filter(p => p.id !== id));
  };
  const updatePatient = (id, updated) => {
    update("patients", form.patients.map(p => p.id === id ? updated : p));
  };

  const handleSave = () => {
    const next = saveDispatchForm(form);
    setForm(next);
    setSaved("Dispatch form saved and incident record synced.");
    toast.success("Dispatch form saved.");
    setTimeout(() => setSaved(""), 2500);
  };

  const handleSendToFieldOfficer = () => {
    if (!form.team) {
      toast.error("Please select a responding team before sending this dispatch.");
      return;
    }
    const result = sendDispatchToRespondingTeam(form);
    setForm(result.dispatch);
    setSaved("Dispatch sent to the selected responding team.");
    toast.success("Dispatch sent to responding team.");
    setTimeout(() => setSaved(""), 3000);
  };

  const handlePrint = () => window.print();

  const natureHas = (t) => form.natureTypes.includes(t);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-foreground">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          {onBack && (
            <button onClick={onBack} className="text-xs text-blue-400 mb-2 flex items-center gap-1">
              <ArrowLeft size={13} /> Dispatch Records
            </button>
          )}
          {!onBack && (
            <button onClick={() => navigate("/admin/dispatch")} className="text-xs text-blue-400 mb-2 flex items-center gap-1">
              <ArrowLeft size={13} /> Dispatch Form Records
            </button>
          )}
          <div className="flex items-center gap-3">
            {/* Org logo placeholder */}
            <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Radio size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Republic of the Philippines · Province of Isabela</p>
              <h1 className="text-lg font-bold text-foreground">Echague Rescue EMS</h1>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Dispatch Form</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-secondary text-sm flex gap-2 items-center hover:bg-secondary/80">
            <Save size={15} /> Save Draft
          </button>
          <button onClick={handleSendToFieldOfficer} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm flex gap-2 items-center hover:bg-green-500">
            <Send size={15} /> Send to Responding Team
          </button>
          <button onClick={handlePrint} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm flex gap-2 items-center hover:bg-blue-500">
            <Download size={15} /> Print / Export
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-sm flex items-center gap-2">
          <CheckCircle2 size={15} /> {saved}
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dispatch Status</div>
          <div className="mt-2 text-sm font-bold text-foreground">{form.status || "Draft"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Linked Incident</div>
          <div className="mt-2 truncate text-sm font-bold text-foreground">{form.incidentId || "Not synced yet"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Linked PCR</div>
          {linkedPCR ? (
            <button onClick={() => navigate(`/admin/pcr/new?edit=${linkedPCR.id}`)} className="mt-2 text-left text-sm font-bold text-blue-400 hover:text-blue-300">
              {linkedPCR.responseNumber || linkedPCR.id} · {linkedPCR.status}
            </button>
          ) : (
            <div className="mt-2 text-sm font-bold text-muted-foreground">PCR creates after team accepts</div>
          )}
        </div>
      </div>

      <div className="space-y-4">

        {/* ── Unit & Response Info ── */}
        <Section title="Response & Unit Details" icon={<Radio size={14} />}>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Response No.">
              <input className={`${input} font-mono text-blue-400`} value={form.responseNumber} readOnly />
            </Field>
            <Field label="Number of Patients / Victims">
              <select className={input} value={form.numberOfPatients} onChange={e => update("numberOfPatients", e.target.value)}>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </Field>
            <Field label="Responding Team">
              <select className={input} value={form.team} onChange={e => update("team", e.target.value)}>
                <option value="">Select responding team</option>
                {RESPONDING_TEAMS.map(team => <option key={team} value={team}>{team}</option>)}
              </select>
            </Field>
            <Field label="Vehicle">
              <input className={input} value={form.vehicle} onChange={e => update("vehicle", e.target.value)} />
            </Field>
            <Field label="Driver">
              <input className={input} value={form.driver} onChange={e => update("driver", e.target.value)} />
            </Field>
            <Field label="Group Leader">
              <input className={input} value={form.groupLeader} onChange={e => update("groupLeader", e.target.value)} />
            </Field>
            <Field label="Assistant Aider">
              <input className={input} value={form.assistantAider} onChange={e => update("assistantAider", e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* ── Caller Data ── */}
        <Section title="Contact Person / Caller Data" icon={<Phone size={14} />}>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Contact Person">
              <input className={input} value={form.callerName} onChange={e => update("callerName", e.target.value)} />
            </Field>
            <Field label="Contact Address">
              <input className={input} value={form.callerAddress} onChange={e => update("callerAddress", e.target.value)} />
            </Field>
            <Field label="Contact Number">
              <input className={input} value={form.callerContact} onChange={e => update("callerContact", e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* ── Nature of Call ── */}
        <Section title="Nature of Call" icon={<FileText size={14} />}>
          <div className="grid lg:grid-cols-[1fr_1fr_.9fr] gap-4">

            {/* Medical / conduction types */}
            <div className="border border-border rounded-xl p-3 space-y-2 bg-secondary/20">
              <span className="block text-xs font-bold uppercase tracking-wide text-foreground mb-1">Type</span>
              <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                {["Conduction", "Transport", "Transfer"].map(t => (
                  <CB key={t} label={t} checked={natureHas(t)} onChange={() => toggleNature(t)} />
                ))}
              </div>
              <hr className="border-border my-1" />
              <span className="block text-xs font-bold uppercase tracking-wide text-foreground">Medical</span>
              <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                {["Medical", "Pediatric", "Psychiatric", "Surgical", "Obstetrical", "Drowning"].map(t => (
                  <CB key={t} label={t} checked={natureHas(t)} onChange={() => toggleNature(t)} />
                ))}
              </div>
              <input
                className={`${smallInput} mt-1`}
                placeholder="Others (medical)"
                value={form.otherMedical}
                onChange={e => update("otherMedical", e.target.value)}
              />
            </div>

            {/* Trauma types */}
            <div className="border border-border rounded-xl p-3 space-y-2 bg-secondary/20">
              <span className="block text-xs font-bold uppercase tracking-wide text-foreground mb-1">Trauma</span>
              <div className="space-y-1.5">
                {["Trauma", "Fall", "Electrocution", "Domestic Violence", "Water Rescue Incident", "Fire Incident"].map(t => (
                  <CB key={t} label={t} checked={natureHas(t)} onChange={() => toggleNature(t)} />
                ))}
              </div>
              <Field label="Assault – specify">
                <input className={smallInput} placeholder="Hacking, stabbing, shooting, stoning..." value={form.assaultDetails} onChange={e => update("assaultDetails", e.target.value)} />
              </Field>
              <Field label="Animal Bite – specify">
                <input className={smallInput} placeholder="Dog / Cat / Snake / Others" value={form.animalBiteDetails} onChange={e => update("animalBiteDetails", e.target.value)} />
              </Field>
              <CB label="Motor Vehicle Crash" checked={natureHas("Motor Vehicle Crash")} onChange={() => toggleNature("Motor Vehicle Crash")} />
              <input className={`${smallInput} mt-1`} placeholder="Other/s" value={form.otherTrauma} onChange={e => update("otherTrauma", e.target.value)} />
            </div>

            {/* Incident details column */}
            <div className="border border-border rounded-xl p-3 bg-card space-y-3">
              <span className="block text-xs font-bold uppercase tracking-wide text-foreground mb-1">Incident Details</span>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Nature</span>
                <div className="flex gap-3">
                  {["Self-Inflicted", "Accidental"].map(n => (
                    <label key={n} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" name={`nature-${form.id}`} checked={form.incidentNature === n} onChange={() => update("incidentNature", n)} className="accent-blue-600" />
                      {n}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="If Ingestion – specify">
                <input className={smallInput} placeholder="Chemical / Object / Others" value={form.ifIngestion} onChange={e => update("ifIngestion", e.target.value)} />
              </Field>
              <Field label="Quantity">
                <input className={smallInput} value={form.quantity} onChange={e => update("quantity", e.target.value)} />
              </Field>
              <Field label="If Fall – specify">
                <input className={smallInput} value={form.ifFall} onChange={e => update("ifFall", e.target.value)} />
              </Field>

              <hr className="border-border" />

              {/* Crash type */}
              <div className="flex gap-3">
                <CB label="Self-Accident" checked={form.selfAccident} onChange={() => update("selfAccident", !form.selfAccident)} />
                <CB label="Collision" checked={form.collision} onChange={() => update("collision", !form.collision)} />
              </div>
              <Field label="Vehicle Involved">
                <input className={smallInput} value={form.vehicleInvolved} onChange={e => update("vehicleInvolved", e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Incident location, time, assistance */}
          <div className="grid md:grid-cols-3 gap-3 mt-4">
            <Field label="Place of Incident" wide>
              <input className={input} value={form.placeOfIncident} onChange={e => update("placeOfIncident", e.target.value)} />
            </Field>
            <Field label="Barangay">
              <input className={input} value={form.barangay || ""} onChange={e => update("barangay", e.target.value)} />
            </Field>
            <Field label="Time of Incident">
              <input type="time" className={input} value={form.timeOfIncident} onChange={e => update("timeOfIncident", e.target.value)} />
            </Field>
            <Field label="Date of Incident">
              <input type="date" className={input} value={form.dateOfIncident} onChange={e => update("dateOfIncident", e.target.value)} />
            </Field>
            <div className="md:col-span-3">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Assistance Needed</span>
              <div className="flex flex-wrap gap-3">
                {ASSISTANCE_OPTIONS.map(opt => (
                  <CB key={opt} label={opt} checked={form.assistanceNeeded.includes(opt)} onChange={() => toggleAssistance(opt)} />
                ))}
                {form.assistanceNeeded.includes("OTHERS") && (
                  <input className={smallInput + " w-40"} placeholder="Specify others" value={form.assistanceOther} onChange={e => update("assistanceOther", e.target.value)} />
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* ── Timeline ── */}
        <Section title="Response Timeline" icon={<Clock size={14} />}>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
            <TimelineField label="Dispatched Time" value={form.dispatchedTime} onChange={v => update("dispatchedTime", v)} />
            <TimelineField label="Arrival at Scene" value={form.arrivalScene} onChange={v => update("arrivalScene", v)} />
            <TimelineField label="Departure at Scene" value={form.departureScene} onChange={v => update("departureScene", v)} />
            <TimelineField label="Arrival at Hospital" value={form.arrivalHospital} onChange={v => update("arrivalHospital", v)} />
            <TimelineField label="Departure at Hospital" value={form.departureHospital} onChange={v => update("departureHospital", v)} />
            <TimelineField label="Arrival at Office" value={form.arrivalOffice} onChange={v => update("arrivalOffice", v)} />
          </div>
          <Field label="Name of Hospital / Facility">
            <input className={input} value={form.nameOfHospital} onChange={e => update("nameOfHospital", e.target.value)} />
          </Field>
        </Section>

        {/* ── Patient / Victim Data ── */}
        <Section title="Patient / Victim Data" icon={<Users size={14} />}>
          <div className="space-y-4">
            {form.patients.map((p, i) => (
              <PatientCard
                key={p.id}
                patient={p}
                index={i}
                onChange={updated => updatePatient(p.id, updated)}
                onRemove={() => removePatient(p.id)}
                canRemove={form.patients.length > 1}
              />
            ))}
            {form.patients.length < 3 && (
              <button
                type="button"
                onClick={addPatient}
                className="w-full py-3 border-2 border-dashed border-blue-400/50 rounded-xl text-blue-500 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-500/5 transition-colors"
              >
                <Plus size={16} /> Add Patient / Victim (max 3)
              </button>
            )}
          </div>
        </Section>

        {/* ── Dispatcher Sign-off ── */}
        <Section title="Dispatcher Sign-off" icon={<CheckCircle2 size={14} />}>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Dispatcher/s">
              <input className={input} value={form.dispatcher} onChange={e => update("dispatcher", e.target.value)} />
            </Field>
            <Field label="Date">
              <input type="date" className={input} value={form.date} onChange={e => update("date", e.target.value)} />
            </Field>
          </div>
        </Section>

      </div>

      {/* ── Footer actions ── */}
      <div className="flex flex-wrap justify-end gap-2 mt-5">
        <button onClick={handleSave} className="px-4 py-2 bg-secondary rounded-lg flex gap-2 text-sm items-center hover:bg-secondary/80">
          <Save size={15} /> Save Draft
        </button>
        <button onClick={handleSendToFieldOfficer} className="px-5 py-2 bg-green-600 text-white rounded-lg flex gap-2 text-sm items-center hover:bg-green-500">
          <Send size={15} /> Send to Responding Team
        </button>
        <button onClick={handlePrint} className="px-5 py-2 bg-blue-600 text-white rounded-lg flex gap-2 text-sm items-center hover:bg-blue-500">
          <Download size={15} /> Print / Export PDF
        </button>
      </div>

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #dispatch-printable, #dispatch-printable * { visibility: visible; }
          #dispatch-printable { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
