import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, Camera, CheckCircle2, ClipboardList, Download, FileText, Maximize2, MapPin, Minus, Plus, RotateCcw, Save, Shield, Trash2, User, X } from "lucide-react";
import { AnatomyEditor, AnatomyFigure, PrintablePCR, SignaturePad } from "../components/PCRWidgets";
import { DISPATCH_EDIT_KEY } from "../utils/dispatchWorkflow";
import { createPCR, exportPCRToPdf, GCS_OPTIONS, INTERVENTIONS, newVital, PCR_EDIT_KEY, synchronizePCR, travelDuration, validateChronology } from "../utils/pcrStorage";
import { getDispatchRecord, getPCRReport, replacePCRVitals, savePCRReport, submitPCRReport } from "../services/supabase";
import { toast } from "sonner";

const steps = [["Response & Patient", <Shield key="shield"/>], ["Assessment", <Activity key="activity"/>], ["Clinical Details", <User key="user"/>], ["Treatment & Handover", <ClipboardList key="clipboard"/>], ["Review & Export", <FileText key="file"/>]];
const input = "w-full px-3 py-2 bg-input-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500";
const emergencyTypes = ["Medical", "Pediatric", "Psychiatric", "Surgical", "Obstetrical", "Drowning"];
const traumaTypes = ["Trauma", "Fall", "Electrocution", "Domestic Violence", "Water Rescue Incident", "Fire Incident", "Assault", "Animal Bite", "Motor Vehicle Crash"];
const medicalHistory = ["None", "Heart Disease", "Hypertension", "Seizure", "COPD", "Diabetes Mellitus", "Asthma", "Stroke"];
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
  return <div className="grid md:grid-cols-5 gap-2">{timelineLabels.map(([label, key]) => <div className="rounded-lg border border-border bg-secondary/40 p-3" key={key}><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold text-foreground">{timeline[key] || "Pending"}</div></div>)}</div>;
}
function CheckGroup({ options, value = [], onChange, columns = 3 }) {
  const toggle = option => onChange(value.includes(option) ? value.filter(x => x !== option) : [...value, option]);
  const minWidth = columns === 2 ? "150px" : "170px";
  return <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))` }}>{options.map(option => <label key={option} className="flex gap-2 items-start min-w-0 text-xs leading-snug text-foreground p-2 rounded-lg border border-border bg-secondary/30"><input type="checkbox" checked={value.includes(option)} onChange={() => toggle(option)} className="accent-blue-600 shrink-0 mt-0.5" /><span className="min-w-0 whitespace-normal break-words">{option}</span></label>)}</div>;
}
function RadioButtons({ options, value, onChange }) { return <div className="flex flex-wrap gap-2">{options.map(option => <button type="button" key={option} onClick={() => onChange(option)} className={`px-3 py-2 rounded-lg border text-xs font-semibold ${value === option ? "bg-blue-600 border-blue-600 text-white" : "border-border text-muted-foreground"}`}>{option}</button>)}</div>; }
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
  return <div className="fixed inset-0 z-50 bg-black/75 p-2 md:p-5 flex flex-col" role="dialog" aria-modal="true" aria-label="Detailed PCR report review">
    <div className="bg-card border border-border rounded-t-xl px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
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
  </div>;
}

export default function PCRModule() {
  const navigate = useNavigate(); const [params] = useSearchParams(); const [step, setStep] = useState(0); const editId = params.get("edit") || sessionStorage.getItem(PCR_EDIT_KEY); const dispatchId = params.get("dispatch"); const [form, setForm] = useState(() => synchronizePCR(createPCR())); const [linkedDispatch, setLinkedDispatch] = useState(null); const [loading, setLoading] = useState(Boolean(editId || dispatchId)); const [bodyOpen, setBodyOpen] = useState(false); const [reviewOpen, setReviewOpen] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => {
    sessionStorage.removeItem(PCR_EDIT_KEY);
    let mounted = true;
    async function loadPCR() {
      if (!editId && !dispatchId) return;
      setLoading(true);
      try {
        if (editId) {
          const record = await getPCRReport(editId);
          if (mounted && record) {
            setForm(synchronizePCR({ ...createPCR(), ...record, timeline: record.timeline || {} }));
            if (record.dispatchId) setLinkedDispatch(await getDispatchRecord(record.dispatchId));
          }
        } else if (dispatchId) {
          const dispatch = await getDispatchRecord(dispatchId);
          if (mounted && dispatch) {
            setLinkedDispatch(dispatch);
            setForm(synchronizePCR({ ...createPCR(), ...dispatch, dispatchId: dispatch.id, responseId: dispatch.responseId }));
          }
        }
      } catch (error) {
        toast.error(error.message || "Unable to load PCR report.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadPCR();
    return () => {
      mounted = false;
    };
  }, [dispatchId, editId]);
  const update = (key, value) => setForm(f => synchronizePCR({ ...f, [key]: value }));
  const updateTimeline = (key, value) => setForm(f => synchronizePCR({ ...f, [key]: value, timeline: { ...(f.timeline || {}), [key]: value } }));
  const updateHospitalArrival = value => setForm(f => synchronizePCR({
    ...f,
    timeline: { ...(f.timeline || {}), endorsementTime: value, arrivalHospital: value },
    arrivalHospital: value,
    hospitalTime: value,
    endorsementTime: value,
    transferArrivalTime: value,
  }));
  const nested = (key, child, value) => setForm(f => ({ ...f, [key]: { ...f[key], [child]: value } }));
  const signature = (key, value) => nested("signatures", key, value); const signatureName = (key, value) => nested("signatureNames", key, value); const signatureDate = (key, value) => nested("signatureDates", key, value);
  const gcsTotal = useMemo(() => Number(form.gcs.eye || 0) + Number(form.gcs.verbal || 0) + Number(form.gcs.motor || 0), [form.gcs]);
  const chronologyError = useMemo(() => validateChronology(form), [form]);
  const hospitalTravel = travelDuration(form.departureScene, form.arrivalHospital);
  const returnTravel = travelDuration(form.departureHospital, form.backToBase);
  const hasDispatchSource = Boolean(params.get("edit") || params.get("dispatch") || form.dispatchId);
  const store = async status => {
    if (chronologyError) { setMessage(chronologyError); return; }
    try {
      const savedDraft = await savePCRReport(form.id, { ...form, status });
      await replacePCRVitals(savedDraft.id, form.vitals || []);
      const saved = status === "Draft" ? savedDraft : await submitPCRReport(savedDraft.id);
      setForm(synchronizePCR({ ...form, ...saved }));
      setMessage(status === "Draft" ? "Draft saved." : "PCR submitted successfully.");
      if (status !== "Draft") setTimeout(() => navigate("/admin/pcr"), 800);
    } catch (error) {
      setMessage(error.message || "Unable to save PCR report.");
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
  const addMedication = () => update("medications", [...form.medications, { drug: "", dose: "", dateTime: "" }]);
  const setMedication = (index, key, value) => update("medications", form.medications.map((m,i)=>i===index?{...m,[key]:value}:m));
  const upload = async e => { const files = [...e.target.files]; if (!files.length) return; const location = await new Promise(resolve => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 5000 }) : resolve(null)); const items = await Promise.all(files.map(file => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, data: reader.result, location, capturedAt: new Date().toISOString() }); reader.readAsDataURL(file); }))); update("attachments", [...form.attachments, ...items]); };

  if (!hasDispatchSource) {
    return <div className="p-4 md:p-6 max-w-3xl mx-auto text-foreground">
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <FileText className="mx-auto mb-3 h-10 w-10 text-blue-500" />
        <h1 className="text-xl font-bold">Start PCR from an Accepted Dispatch</h1>
        <p className="mt-2 text-sm text-muted-foreground">PCR Reports are now created from dispatch records. Accept a received dispatch first so shared incident fields and the response number are filled automatically.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={() => navigate("/admin/dispatch/received")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open Received Dispatches</button>
          <button onClick={() => navigate("/admin/pcr")} className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold">Patient Care Records</button>
        </div>
      </div>
    </div>;
  }

  return <div className="p-4 md:p-6 max-w-7xl mx-auto text-foreground">
    {loading && <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Loading PCR report...</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><div><button onClick={() => navigate("/admin/pcr")} className="text-xs text-blue-400 mb-2 flex items-center gap-1"><ArrowLeft size={13}/>Patient Care Records</button><h1 className="text-xl font-bold flex items-center gap-2"><FileText className="text-blue-500"/>Create PCR Report</h1><p className="text-xs text-muted-foreground">Create and submit a new Patient Care Report.</p></div><div className="flex gap-2"><button onClick={() => store("Draft")} className="px-4 py-2 rounded-lg bg-secondary text-sm flex gap-2 items-center"><Save size={15}/>Save Draft</button><button onClick={downloadPdf} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm flex gap-2 items-center"><Download size={15}/>Download PDF</button></div></div>
    {linkedDispatch && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm"><div><div className="font-semibold text-blue-300">Linked Dispatch Form</div><div className="text-xs text-muted-foreground">{linkedDispatch.responseNumber || linkedDispatch.id} · {linkedDispatch.placeOfIncident || "No location entered"}</div></div><button onClick={() => { sessionStorage.setItem(DISPATCH_EDIT_KEY, linkedDispatch.id); navigate(`/admin/dispatch/new?edit=${linkedDispatch.id}`); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Open Dispatch</button></div>}
    {message && <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${chronologyError ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-green-500/10 border-green-500/30 text-green-500"}`}>{message}</div>}
    {chronologyError && <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">{chronologyError}</div>}
    <div className="grid grid-cols-5 gap-1 mb-5">{steps.map(([name,icon],i)=><button key={name} onClick={()=>setStep(i)} className={`p-2 md:p-3 rounded-lg border text-center ${step===i?"bg-blue-600 border-blue-600 text-white":"bg-card border-border text-muted-foreground"}`}><span className="block w-4 h-4 mx-auto mb-1">{icon}</span><span className="text-[10px] md:text-xs font-semibold">{name}</span></button>)}</div>
    <div className="space-y-4">
      {step === 0 && <>
        <Section title="Response and Unit Details"><div className="grid md:grid-cols-3 gap-3"><Field label="Response No."><input className={`${input} font-mono text-blue-400`} value={form.responseNumber} readOnly/></Field><Field label="Responding Team"><input className={input} value={form.respondingTeam} onChange={e=>update("respondingTeam",e.target.value)}/></Field><Field label="Vehicle"><input className={input} value={form.vehicle} onChange={e=>update("vehicle",e.target.value)}/></Field><Field label="Driver"><input className={input} value={form.driver} onChange={e=>update("driver",e.target.value)}/></Field><Field label="Main Aider"><input className={input} value={form.mainAider} onChange={e=>update("mainAider",e.target.value)}/></Field><Field label="Assistant Aider"><input className={input} value={form.assistantAider} onChange={e=>update("assistantAider",e.target.value)}/></Field></div></Section>
        <Section title="Patient Information"><div className="grid md:grid-cols-4 gap-3"><Field label="Patient Name" wide><input className={input} value={form.patientName} onChange={e=>update("patientName",e.target.value)}/></Field><Field label="Age"><input type="number" className={input} value={form.age} onChange={e=>update("age",e.target.value)}/></Field><Field label="Birthday"><input type="date" className={input} value={form.birthday} onChange={e=>update("birthday",e.target.value)}/></Field><Field label="Gender"><select className={input} value={form.gender} onChange={e=>update("gender",e.target.value)}><option value="">Select</option>{["Male","Female","Other"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Civil Status"><select className={input} value={form.civilStatus} onChange={e=>update("civilStatus",e.target.value)}><option value="">Select</option>{["Single","Married","Widowed","Separated"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Address" wide><input className={input} value={form.address} onChange={e=>update("address",e.target.value)}/></Field><Field label="Contact Person"><input className={input} value={form.contactPerson} onChange={e=>update("contactPerson",e.target.value)}/></Field><Field label="Contact Number"><input className={input} value={form.contactNumber} onChange={e=>update("contactNumber",e.target.value)}/></Field></div></Section>
        <Section title="Nature and Initial Incident Details"><div className="mb-3"><RadioButtons options={["Emergency","Conduction"]} value={form.natureOfCall} onChange={v=>update("natureOfCall",v)}/></div><div className="grid md:grid-cols-4 gap-3"><Field label="Date of Incident"><input type="date" className={input} value={form.timeline?.dateOfIncident || form.dateOfIncident} onChange={e=>updateTimeline("dateOfIncident",e.target.value)}/></Field><Field label="Time of Incident"><input type="time" className={input} value={form.timeline?.timeOfIncident || form.timeOfIncident} onChange={e=>updateTimeline("timeOfIncident",e.target.value)}/></Field><Field label="Place of Incident"><input className={input} value={form.timeline?.placeOfIncident || form.placeOfIncident} onChange={e=>updateTimeline("placeOfIncident",e.target.value)}/></Field><Field label="Dispatch Time"><input type="time" className={input} value={form.timeline?.dispatchTime || form.dispatchTime} onChange={e=>updateTimeline("dispatchTime",e.target.value)}/></Field></div></Section>
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
                <CheckGroup options={emergencyTypes.filter(x=>x!=="Medical")} value={form.emergencyTypes} onChange={v=>update("emergencyTypes",v)}/>
                <input className={`${input} mt-2`} placeholder="Others" value={form.emergencyOther} onChange={e=>update("emergencyOther",e.target.value)}/>
              </div>
              <div className="border border-border rounded-xl p-3 bg-secondary/20">
                <label className="flex gap-2 items-center text-sm font-bold mb-2">
                  <input type="checkbox" checked={form.traumaTypes.includes("Trauma")} onChange={() => update("traumaTypes", form.traumaTypes.includes("Trauma") ? form.traumaTypes.filter(x=>x!=="Trauma") : [...form.traumaTypes,"Trauma"])} className="accent-red-600"/>
                  TRAUMA
                </label>
                <CheckGroup options={traumaTypes.filter(x=>x!=="Trauma")} value={form.traumaTypes} onChange={v=>update("traumaTypes",v)}/>
                <div className="grid md:grid-cols-2 gap-2 mt-2">
                  <input className={input} placeholder="Assault: hacking, stabbing, shooting..." value={form.assaultDetails} onChange={e=>update("assaultDetails",e.target.value)}/>
                  <input className={input} placeholder="Animal bite: dog/cat/snake/others" value={form.animalBiteDetails} onChange={e=>update("animalBiteDetails",e.target.value)}/>
                </div>
              </div>
              <div className="border border-border rounded-xl p-3 bg-card space-y-2">
                <Field label="Nature"><input className={input} placeholder="Self-inflicted / accidental" value={form.incidentNature} onChange={e=>update("incidentNature",e.target.value)}/></Field>
                <Field label="If ingestion"><input className={input} placeholder="Specify item" value={form.ingestionItem} onChange={e=>update("ingestionItem",e.target.value)}/></Field>
                <Field label="Quantity"><input className={input} value={form.ingestionQuantity} onChange={e=>update("ingestionQuantity",e.target.value)}/></Field>
                <Field label="If fall"><input className={input} value={form.fallDetails} onChange={e=>update("fallDetails",e.target.value)}/></Field>
              </div>
            </div>
          </div>
        </Section>
        <Section title="Obstetric and Motor Vehicle Data">
          <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
            <div className="grid grid-cols-3 gap-2">{Object.keys(form.obstetric).map(k=><Field key={k} label={k.toUpperCase()}><input className={input} value={form.obstetric[k]} onChange={e=>nested("obstetric",k,e.target.value)}/></Field>)}</div>
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
        <Section title="Glasgow Coma Scale"><div className="grid md:grid-cols-4 gap-3">{Object.entries(GCS_OPTIONS).map(([key,options])=><Field key={key} label={`${key.toUpperCase()} Response`}><select className={input} value={form.gcs[key]} onChange={e=>nested("gcs",key,e.target.value)}><option value="">Select</option>{options.map(([name,score])=><option key={score} value={score}>{name} - {score}</option>)}</select></Field>)}<div className="rounded-xl bg-blue-600 text-white p-4 text-center"><div className="text-xs">TOTAL GCS</div><div className="text-3xl font-bold">{gcsTotal || "-"}</div></div></div></Section>
      </>}
      {step === 2 && <>
        <Section title="Airway, Breathing and Circulation"><div className="space-y-4"><div><span className="text-xs font-semibold">Suspected spinal injury</span><RadioButtons options={["Yes","No"]} value={form.suspectedSpinal} onChange={v=>update("suspectedSpinal",v)}/></div><div className="grid md:grid-cols-2 gap-4"><div><span className="text-xs font-semibold">Airway</span><CheckGroup options={["Open Airway","Closed Airway","NT/OPA","Jaw Thrust","Suction","Finger Sweep","Abdominal Thrust"]} value={form.airway} onChange={v=>update("airway",v)} columns={2}/></div><div><span className="text-xs font-semibold">Breathing</span><CheckGroup options={["Positive","Negative","O2 Not Required","O2 Given","Nasal Cannula","Simple Mask","Non-Rebreather Mask","Others"]} value={form.breathing} onChange={v=>update("breathing",v)} columns={2}/><div className="grid grid-cols-2 gap-2 mt-2"><input className={input} placeholder="O2 LPM" value={form.oxygenLpm} onChange={e=>update("oxygenLpm",e.target.value)}/><input className={input} placeholder="O2 delivery / other" value={form.oxygenVia} onChange={e=>update("oxygenVia",e.target.value)}/></div></div></div><div className="grid md:grid-cols-2 gap-4"><div><span className="text-xs font-semibold">Pulse / Circulation</span><CheckGroup options={["Positive","Negative","Strong","Weak"]} value={form.pulseFindings} onChange={v=>update("pulseFindings",v)} columns={2}/></div><div className="grid grid-cols-3 gap-2"><Field label="Bleeding"><select className={input} value={form.bleeding} onChange={e=>update("bleeding",e.target.value)}><option/><option>Mild</option><option>Severe</option><option>None</option></select></Field><Field label="Location"><input className={input} value={form.bleedingLocation} onChange={e=>update("bleedingLocation",e.target.value)}/></Field><Field label="Controlled"><select className={input} value={form.bleedingControlled} onChange={e=>update("bleedingControlled",e.target.value)}><option/><option>Yes</option><option>No</option></select></Field></div></div><div className="grid md:grid-cols-3 gap-3"><div><span className="text-xs font-semibold">Capillary Refill</span><RadioButtons options={["Less than 2 seconds","More than 2 seconds"]} value={form.capillary} onChange={v=>update("capillary",v)}/></div><div><span className="text-xs font-semibold">Pupils</span><CheckGroup options={["Equal","Dilated","Constricted","No Reaction"]} value={form.pupils} onChange={v=>update("pupils",v)} columns={2}/></div><div><span className="text-xs font-semibold">Skin</span><CheckGroup options={["Warm","Cold","Dry","Moist","Pale","Flushed","Jaundiced"]} value={form.skin} onChange={v=>update("skin",v)} columns={2}/></div></div></div></Section>
        <Section title="Pain Assessment"><div className="grid md:grid-cols-3 gap-3"><div><RadioButtons options={["Positive","Negative"]} value={form.painPositive} onChange={v=>update("painPositive",v)}/></div><Field label="Pain Score 0-10"><input type="range" min="0" max="10" value={form.painScore||0} onChange={e=>update("painScore",e.target.value)} className="w-full"/><div className="text-center font-bold">{form.painScore||0}</div></Field><Field label="Onset"><select className={input} value={form.painOnset} onChange={e=>update("painOnset",e.target.value)}><option/><option>Sudden</option><option>Gradual</option></select></Field></div><CheckGroup options={["Crushing","Stabbing","Aching","Gnawing","Burning","Tearing","Cramping"]} value={form.painQuality} onChange={v=>update("painQuality",v)}/><input className={`${input} mt-2`} placeholder="Other pain description" value={form.painOther} onChange={e=>update("painOther",e.target.value)}/></Section>
        <Section title="Allergies, Medication and History"><div className="grid md:grid-cols-2 gap-4"><div className="space-y-2"><RadioButtons options={["With Allergies","No Allergies"]} value={form.allergies.status} onChange={v=>nested("allergies","status",v)}/>{[["Food","food"],["Drug","drug"],["Other","other"]].map(([l,k])=><Field key={k} label={`${l} Allergy`}><input className={input} value={form.allergies[k]} onChange={e=>nested("allergies",k,e.target.value)}/></Field>)}</div><div><div className="space-y-2">{form.medications.map((m,i)=><div key={i} className="grid grid-cols-3 gap-2"><input className={input} placeholder="Drug" value={m.drug} onChange={e=>setMedication(i,"drug",e.target.value)}/><input className={input} placeholder="Dose" value={m.dose} onChange={e=>setMedication(i,"dose",e.target.value)}/><input className={input} type="datetime-local" value={m.dateTime} onChange={e=>setMedication(i,"dateTime",e.target.value)}/></div>)}</div><button onClick={addMedication} className="text-xs text-blue-500 mt-2 flex gap-1"><Plus size={13}/>Add medication</button></div></div><div className="mt-4"><CheckGroup options={medicalHistory} value={form.medicalHistory} onChange={v=>update("medicalHistory",v)}/><input className={`${input} mt-2`} placeholder="Other medical history" value={form.medicalHistoryOther} onChange={e=>update("medicalHistoryOther",e.target.value)}/></div></Section>
        <Section title="Hospitalization, Intake, Smoking, Alcohol and Events"><div className="grid md:grid-cols-3 gap-3"><Field label="Hospitalization Status"><select className={input} value={form.hospitalization.status} onChange={e=>nested("hospitalization","status",e.target.value)}><option/><option>Yes</option><option>None</option></select></Field><Field label="Last Confinement"><input type="date" className={input} value={form.hospitalization.date} onChange={e=>nested("hospitalization","date",e.target.value)}/></Field><Field label="Where"><input className={input} value={form.hospitalization.where} onChange={e=>nested("hospitalization","where",e.target.value)}/></Field><Field label="Due To"><input className={input} value={form.hospitalization.reason} onChange={e=>nested("hospitalization","reason",e.target.value)}/></Field><Field label="Last Oral Intake"><input className={input} value={form.oralIntake} onChange={e=>update("oralIntake",e.target.value)}/></Field><Field label="Intake Date and Time"><input type="datetime-local" className={input} value={form.oralIntakeDateTime} onChange={e=>update("oralIntakeDateTime",e.target.value)}/></Field><Field label="Smoking Status / sticks per day / stopped since"><input className={input} value={`${form.smoking.status} ${form.smoking.sticks} ${form.smoking.stopped}`} onChange={e=>nested("smoking","status",e.target.value)}/></Field><Field label="Alcohol Status"><input className={input} value={form.alcohol.status} onChange={e=>nested("alcohol","status",e.target.value)}/></Field><Field label="How Often"><input className={input} value={form.alcohol.frequency} onChange={e=>nested("alcohol","frequency",e.target.value)}/></Field><Field label="Events Prior to Injury" wide><textarea rows="3" className={input} value={form.eventsPrior} onChange={e=>update("eventsPrior",e.target.value)}/></Field></div></Section>
      </>}
      {step === 3 && <>
        <Section title="Intervention Checklist"><div className="grid md:grid-cols-2 gap-2">{INTERVENTIONS.map(item=><div key={item} className="grid grid-cols-[1fr_auto] items-center gap-2 border border-border rounded-lg p-2"><span className="text-xs">{item}</span><RadioButtons options={["Yes","No"]} value={form.interventions[item]} onChange={v=>update("interventions",{...form.interventions,[item]:v})}/>{["Oxygen inhalation","Application of arm sling","Placed in recovery position","Others"].includes(item)&&<input className={`${input} col-span-2`} placeholder="Details" value={form.interventionDetails[item]||""} onChange={e=>update("interventionDetails",{...form.interventionDetails,[item]:e.target.value})}/>}</div>)}</div></Section>
        <Section title="Hospital Endorsement and Transfer"><div className="grid md:grid-cols-3 gap-3"><Field label="Reason for Transfer / Not Admitting" wide><textarea className={input} rows="3" value={form.transferReason} onChange={e=>update("transferReason",e.target.value)}/></Field><Field label="Hospital / Facility"><input className={input} value={form.hospitalName} onChange={e=>update("hospitalName",e.target.value)}/></Field><Field label="Resident on Duty"><input className={input} value={form.residentOnDuty} onChange={e=>update("residentOnDuty",e.target.value)}/></Field><Field label="Date"><input type="date" className={input} value={form.hospitalDate} onChange={e=>update("hospitalDate",e.target.value)}/></Field><Field label="Arrival Endorsement Time"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.endorsementTime || form.endorsementTime || form.hospitalTime || form.arrivalHospital} onChange={e=>updateHospitalArrival(e.target.value)}/><span className="block text-[10px] text-muted-foreground mt-1">Entering this automatically fills Arrival at Hospital.</span></Field><Field label="Arrival at Hospital"><input type="time" className={input} value={form.timeline?.arrivalHospital || form.arrivalHospital} readOnly/></Field><Field label="Consent for Care"><input className={input} value={form.consentForCare} onChange={e=>update("consentForCare",e.target.value)}/></Field><Field label="Endorsed To"><input className={input} value={form.endorsedTo} onChange={e=>update("endorsedTo",e.target.value)}/></Field><Field label="Received By"><input className={input} value={form.receivedBy} onChange={e=>update("receivedBy",e.target.value)}/></Field><Field label="Hospital"><input className={input} value={form.endorsementHospital} onChange={e=>update("endorsementHospital",e.target.value)}/></Field><Field label="Receiver Name"><input className={input} value={form.receiverName} onChange={e=>update("receiverName",e.target.value)}/></Field><Field label="Receiver Position"><input className={input} value={form.receiverPosition} onChange={e=>update("receiverPosition",e.target.value)}/></Field><Field label="Receiver Contact Number"><input className={input} value={form.receiverContact} onChange={e=>update("receiverContact",e.target.value)}/></Field><label className="md:col-span-3 flex gap-3 items-start p-3 border border-border rounded-lg bg-secondary/30"><input type="checkbox" checked={form.receiverConfirmed} onChange={e=>update("receiverConfirmed",e.target.checked)} className="mt-1 accent-blue-600"/><span className="text-xs"><b>Confirm hospital handover</b><br/>Receiver details are complete and the handover has been acknowledged. Departure at Hospital remains editable in this step.</span></label><Field label="Departure at Hospital"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.departureHospital || form.departureHospital} onChange={e=>updateTimeline("departureHospital",e.target.value)}/></Field><Field label="Valuables Endorsed" wide><textarea className={input} value={form.valuables} onChange={e=>update("valuables",e.target.value)}/></Field><Field label="Valuables Received By"><input className={input} value={form.valuablesReceivedBy} onChange={e=>update("valuablesReceivedBy",e.target.value)}/></Field><Field label="Receiver Contact"><input className={input} value={form.valuablesContact} onChange={e=>update("valuablesContact",e.target.value)}/></Field></div></Section>
        <Section title="Waiver / Refusal of Treatment or Transport"><label className="flex gap-3 items-start p-3 border border-border rounded-lg"><input type="checkbox" checked={form.waiverAccepted} onChange={e=>update("waiverAccepted",e.target.checked)} className="mt-1 accent-blue-600"/><span className="text-xs leading-relaxed">The patient/victim acknowledges that refusal of treatment or transport may result in death or imperil health, assumes the risks and consequences, and releases the emergency services crew from liability arising from the refusal.</span></label><Field label="Reason for refusal"><textarea className={`${input} mt-3`} rows="2" value={form.waiverReason} onChange={e=>update("waiverReason",e.target.value)}/></Field><div className="grid md:grid-cols-3 gap-4 mt-4">{[["Patient","patient"],["Witness 1","witness1"],["Witness 2","witness2"]].map(([l,k])=><div key={k}><SignaturePad label={`${l} Signature`} value={form.signatures[k]} onChange={v=>signature(k,v)}/><input className={`${input} mt-2`} placeholder="Printed name" value={form.signatureNames[k]} onChange={e=>signatureName(k,e.target.value)}/><input type="datetime-local" className={`${input} mt-2`} value={form.signatureDates[k]} onChange={e=>signatureDate(k,e.target.value)}/></div>)}</div></Section>
        <Section title="Digital Documentation"><div className="grid md:grid-cols-2 gap-4"><div><SignaturePad label="Report Annotation (stylus / touch)" value={form.annotation} onChange={v=>update("annotation",v)}/></div><div><label className="h-36 border-2 border-dashed border-blue-400 rounded-xl flex flex-col items-center justify-center cursor-pointer bg-blue-500/5"><Camera className="text-blue-500 mb-2"/><span className="text-sm font-semibold">Upload geotagged photos or documents</span><span className="text-xs text-muted-foreground">Location is requested at upload time</span><input type="file" multiple accept="image/*,.pdf" onChange={upload} className="hidden"/></label><div className="mt-2 space-y-1">{form.attachments.map(a=><div key={a.id} className="text-xs flex justify-between border border-border rounded p-2"><span>{a.name}</span><span className="text-muted-foreground flex gap-1 items-center"><MapPin size={11}/>{a.location?`${a.location.lat.toFixed(5)}, ${a.location.lng.toFixed(5)}`:"No location"}</span></div>)}</div></div></div><Field label="Additional Notes"><textarea className={`${input} mt-3`} rows="3" value={form.notes} onChange={e=>update("notes",e.target.value)}/></Field><div className="grid md:grid-cols-3 gap-3 mt-3"><Field label="Back to Base"><input type="time" className={`${input} ${chronologyError ? "border-red-500/50" : ""}`} value={form.timeline?.backToBase || form.backToBase} onChange={e=>updateTimeline("backToBase",e.target.value)}/></Field><div className="md:col-span-2 rounded-lg bg-secondary p-2 text-xs text-muted-foreground self-end">Hospital to base travel: <b>{returnTravel || "Pending"}</b></div></div></Section>
      </>}
      {step === 4 && <Section title="Review and Submit"><div className="grid md:grid-cols-3 gap-3 mb-4">{[["Response",form.responseNumber],["Patient",form.patientName],["Incident",`${form.dateOfIncident} ${form.timeOfIncident}`],["Triage",form.triage],["GCS",gcsTotal||"Not scored"],["Hospital",form.hospitalName||"Not specified"]].map(([l,v])=><div className="p-3 bg-secondary rounded-lg" key={l}><div className="text-[10px] uppercase text-muted-foreground">{l}</div><div className="font-semibold text-sm">{v||"Not entered"}</div></div>)}</div><div className="mb-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Complete Incident Timeline</h4><TimelineSummary timeline={form.timeline || form}/></div><button type="button" onClick={()=>setReviewOpen(true)} className="w-full group relative border border-border bg-white overflow-hidden rounded-xl max-h-[650px] cursor-zoom-in text-left" aria-label="Open detailed PCR report review"><div className="sticky top-3 z-10 flex justify-end px-3 pointer-events-none"><span className="flex items-center gap-2 rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-semibold shadow-lg group-hover:bg-blue-500"><Maximize2 size={15}/>Open detailed review</span></div><div className="origin-top scale-[.72] md:scale-90 -mt-8"><PrintablePCR record={form}/></div></button><p className="text-xs text-muted-foreground mt-2 text-center">Click the report preview to open it, zoom in, and review all details.</p><div className="flex flex-wrap justify-end gap-2 mt-4"><button onClick={()=>store("Draft")} className="px-4 py-2 bg-secondary rounded-lg flex gap-2 text-sm"><Save size={15}/>Save Draft</button><button onClick={downloadPdf} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex gap-2 text-sm"><Download size={15}/>Download PDF</button><button onClick={()=>store("Submitted")} className="px-5 py-2 bg-green-600 text-white rounded-lg flex gap-2 text-sm"><CheckCircle2 size={15}/>Submit PCR</button></div></Section>}
    </div>
    <div className="flex justify-between mt-5"><button disabled={step===0} onClick={()=>setStep(s=>s-1)} className="px-4 py-2 bg-secondary rounded-lg disabled:opacity-40 flex gap-2 items-center"><ArrowLeft size={15}/>Previous</button><button disabled={step===steps.length-1} onClick={()=>setStep(s=>s+1)} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-40 flex gap-2 items-center">Next<ArrowRight size={15}/></button></div>
    {bodyOpen&&<AnatomyEditor value={form.bodyMap} onClose={()=>setBodyOpen(false)} onSave={value=>{update("bodyMap",value);setBodyOpen(false);}}/>}{reviewOpen&&<DetailedPCRReview record={form} onClose={()=>setReviewOpen(false)}/>}<PrintablePCR record={form} printOnly/>
  </div>;
}
