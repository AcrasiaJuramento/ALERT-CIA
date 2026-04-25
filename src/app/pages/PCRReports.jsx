import { useState } from "react";
import {
  CheckCircle, ArrowRight, ArrowLeft, FileText,
  User, Activity, Ambulance, ClipboardList, Shield,
  Phone, MapPin, Clock, Camera, Save, Download, Send
} from "lucide-react";

const steps = [
  { id: 1, label: "Responding Unit", icon: Shield },
  { id: 2, label: "Patient Info", icon: User },
  { id: 3, label: "Assessment", icon: Activity },
  { id: 4, label: "Response & Transport", icon: Ambulance },
  { id: 5, label: "Report Overview", icon: ClipboardList },
];

const initialForm = {
  // Step 1: Responding Unit
  responseNumber: "PCR-2026-0314-024",
  respondingTeam: "",
  vehicle: "",
  driver: "",
  mainAider: "",
  assistantAider: "",
  natureOfCall: "emergency",
  dateOfIncident: "2026-03-14",
  timeOfIncident: "08:23",
  placeOfIncident: "",
  departureTime: "",
  arrivalAtScene: "",
  departureFromScene: "",

  // Step 2: Patient Info
  patientName: "",
  age: "",
  birthday: "",
  gender: "",
  civilStatus: "",
  address: "",
  contactPerson: "",
  contactNumber: "",

  // Step 3: Assessment
  initialAssessment: "",
  patientCondition: "",
  injuryType: [],
  bloodPressure: "",
  pulseRate: "",
  respiratoryRate: "",
  temperature: "",
  gcsScore: "",
  observations: "",

  // Step 4: Response & Transport
  transported: "",
  hospitalName: "",
  transportVehicle: "",
  waiverSigned: "",
  waiverReason: "",
  additionalNotes: "",
  imagesUploaded: [],
};

export default function PCRReport() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (key, val) =>
    setForm(f => ({ ...f, [key]: val }));

  const toggleInjury = (injury) => {
    const current = form.injuryType;
    update("injuryType", current.includes(injury) ? current.filter(i => i !== injury) : [...current, injury]);
  };

  const nextStep = () => setStep(s => Math.min(5, s + 1));
  const prevStep = () => setStep(s => Math.max(1, s - 1));

  const handleSubmit = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1500));
    setSaving(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={36} className="text-green-600" />
          </div>
          <h2 className="text-slate-800 font-black text-xl mb-2">PCR Report Submitted!</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-4">
            Patient Care Report <strong>{form.responseNumber}</strong> has been submitted successfully and is pending admin verification.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => { setSubmitted(false); setStep(1); setForm(initialForm); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-500 transition-colors">
              New PCR Report
            </button>
            <button className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm hover:bg-slate-200 transition-colors">
              <Download size={13} /> Export PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-slate-800 font-bold text-lg flex items-center gap-2">
          <FileText size={18} className="text-blue-600" /> Patient Care Report (PCR)
        </h2>
        <p className="text-slate-500 text-xs mt-1">Multi-step incident reporting workflow</p>
      </div>

      {/* Step Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex items-center">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div
                className="flex flex-col items-center gap-1 cursor-pointer"
                onClick={() => step > s.id && setStep(s.id)}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
                    ${step > s.id
                      ? "bg-green-500 text-white shadow-lg shadow-green-200"
                      : step === s.id
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-200 ring-4 ring-blue-100"
                      : "bg-slate-100 text-slate-400"
                    }`}
                >
                  {step > s.id ? <CheckCircle size={16} /> : <s.icon size={16} />}
                </div>
                <span className={`text-[10px] font-semibold hidden md:block whitespace-nowrap ${step === s.id ? "text-blue-600" : step > s.id ? "text-green-600" : "text-slate-400"}`}>
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-1 mx-2 rounded transition-all ${step > s.id ? "bg-green-400" : "bg-slate-100"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {/* Step Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {(() => {
              const s = steps[step - 1];
              return (
                <>
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                    <s.icon size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-slate-800 font-bold text-sm">Step {step}: {s.label}</h3>
                    <p className="text-slate-400 text-xs">Fill in the required information below</p>
                  </div>
                </>
              );
            })()}
          </div>
          <span className="text-slate-400 text-xs">{step} of {steps.length}</span>
        </div>

        <div className="p-6">
          {/* STEP 1: Responding Unit */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Response Number" required>
                  <input type="text" value={form.responseNumber} onChange={e => update("responseNumber", e.target.value)}
                    className={inputClass} placeholder="Auto-generated" />
                </FormField>
                <FormField label="Responding Team" required>
                  <select value={form.respondingTeam} onChange={e => update("respondingTeam", e.target.value)} className={inputClass}>
                    <option value="">Select team</option>
                    {["Team Alpha", "Team Bravo", "Team Charlie", "Team Delta", "Team Echo", "Team Foxtrot"].map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Vehicle">
                  <select value={form.vehicle} onChange={e => update("vehicle", e.target.value)} className={inputClass}>
                    <option value="">Select vehicle</option>
                    {["Rescue Van 01", "Rescue Van 02", "Ambulance 01", "Ambulance 02", "Command Vehicle"].map(v => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Driver">
                  <input type="text" value={form.driver} onChange={e => update("driver", e.target.value)}
                    className={inputClass} placeholder="Driver name" />
                </FormField>
                <FormField label="Main Aider">
                  <input type="text" value={form.mainAider} onChange={e => update("mainAider", e.target.value)}
                    className={inputClass} placeholder="Main aider name" />
                </FormField>
                <FormField label="Assistant Aider">
                  <input type="text" value={form.assistantAider} onChange={e => update("assistantAider", e.target.value)}
                    className={inputClass} placeholder="Assistant aider name" />
                </FormField>
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Nature of Call</label>
                <div className="flex gap-3">
                  {["emergency", "conduction"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update("natureOfCall", type)}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold capitalize transition-all
                        ${form.natureOfCall === type
                          ? type === "emergency"
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                    >
                      {type === "emergency" ? "🚨 Emergency" : "🚗 Conduction"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Incident Details</label>
                <div className="grid md:grid-cols-3 gap-4">
                  <FormField label="Date of Incident" required>
                    <input type="date" value={form.dateOfIncident} onChange={e => update("dateOfIncident", e.target.value)} className={inputClass} />
                  </FormField>
                  <FormField label="Time of Incident" required>
                    <input type="time" value={form.timeOfIncident} onChange={e => update("timeOfIncident", e.target.value)} className={inputClass} />
                  </FormField>
                  <FormField label="Place of Incident" required>
                    <input type="text" value={form.placeOfIncident} onChange={e => update("placeOfIncident", e.target.value)}
                      className={inputClass} placeholder="Location/Address" />
                  </FormField>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Timeline</label>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { key: "departureTime", label: "Departure Time" },
                    { key: "arrivalAtScene", label: "Arrival at Scene" },
                    { key: "departureFromScene", label: "Departure from Scene" },
                  ].map(({ key, label }) => (
                    <FormField key={key} label={label}>
                      <div className="relative">
                        <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="time" value={form[key]} onChange={e => update(key, e.target.value)} className={`${inputClass} pl-9`} />
                      </div>
                    </FormField>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Patient Information */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Patient Full Name" required>
                  <div className="relative">
                    <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={form.patientName} onChange={e => update("patientName", e.target.value)}
                      className={`${inputClass} pl-9`} placeholder="Last name, First name M.I." />
                  </div>
                </FormField>
                <FormField label="Age" required>
                  <input type="number" value={form.age} onChange={e => update("age", e.target.value)}
                    className={inputClass} placeholder="Patient age" min="0" max="120" />
                </FormField>
                <FormField label="Birthday">
                  <input type="date" value={form.birthday} onChange={e => update("birthday", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Gender" required>
                  <div className="flex gap-2">
                    {["Male", "Female", "Other"].map(g => (
                      <button key={g} type="button" onClick={() => update("gender", g)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${form.gender === g ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </FormField>
                <FormField label="Civil Status">
                  <select value={form.civilStatus} onChange={e => update("civilStatus", e.target.value)} className={inputClass}>
                    <option value="">Select status</option>
                    {["Single", "Married", "Widowed", "Separated"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </FormField>
                <FormField label="Address" required>
                  <div className="relative">
                    <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={form.address} onChange={e => update("address", e.target.value)}
                      className={`${inputClass} pl-9`} placeholder="Complete address" />
                  </div>
                </FormField>
                <FormField label="Contact Person">
                  <input type="text" value={form.contactPerson} onChange={e => update("contactPerson", e.target.value)}
                    className={inputClass} placeholder="Emergency contact name" />
                </FormField>
                <FormField label="Contact Number">
                  <div className="relative">
                    <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="tel" value={form.contactNumber} onChange={e => update("contactNumber", e.target.value)}
                      className={`${inputClass} pl-9`} placeholder="09XX-XXX-XXXX" />
                  </div>
                </FormField>
              </div>
            </div>
          )}

          {/* STEP 3: Assessment */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Initial Assessment" required>
                  <select value={form.initialAssessment} onChange={e => update("initialAssessment", e.target.value)} className={inputClass}>
                    <option value="">Select assessment</option>
                    {["Conscious", "Unconscious", "Semi-conscious", "Unresponsive", "Deceased"].map(a => <option key={a}>{a}</option>)}
                  </select>
                </FormField>
                <FormField label="Patient Condition" required>
                  <select value={form.patientCondition} onChange={e => update("patientCondition", e.target.value)} className={inputClass}>
                    <option value="">Select condition</option>
                    {["Stable", "Critical", "Serious", "Fair", "Poor"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </FormField>
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Injury Type (select all that apply)</label>
                <div className="flex flex-wrap gap-2">
                  {["Head Trauma", "Chest Injury", "Abdominal Injury", "Fracture", "Laceration", "Burns", "Spinal Injury", "Internal Bleeding", "Cardiac Arrest", "Respiratory Distress", "Drowning", "Poisoning"].map(injury => (
                    <button
                      key={injury}
                      type="button"
                      onClick={() => toggleInjury(injury)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                        ${(form.injuryType || []).includes(injury)
                          ? "bg-red-100 border-red-300 text-red-700"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                    >
                      {injury}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Vital Signs</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: "bloodPressure", label: "Blood Pressure", placeholder: "120/80 mmHg" },
                    { key: "pulseRate", label: "Pulse Rate", placeholder: "80 bpm" },
                    { key: "respiratoryRate", label: "Respiratory Rate", placeholder: "16 rpm" },
                    { key: "temperature", label: "Temperature", placeholder: "36.5°C" },
                  ].map(({ key, label, placeholder }) => (
                    <FormField key={key} label={label}>
                      <input type="text" value={form[key]} onChange={e => update(key, e.target.value)}
                        className={inputClass} placeholder={placeholder} />
                    </FormField>
                  ))}
                </div>
                <div className="mt-3">
                  <FormField label="Glasgow Coma Scale (GCS Score)">
                    <input type="number" value={form.gcsScore} onChange={e => update("gcsScore", e.target.value)}
                      className={inputClass} placeholder="3–15" min="3" max="15" />
                  </FormField>
                </div>
              </div>

              <FormField label="Field Officer Observations">
                <textarea
                  value={form.observations}
                  onChange={e => update("observations", e.target.value)}
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder="Document all field observations, interventions administered, patient response to treatment..."
                />
              </FormField>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-blue-700 text-xs">
                  ℹ️ Assessment information will be submitted to the dispatch office and admin for verification and review.
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: Response & Transport */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Hospital Transport</label>
                <div className="flex gap-3 mb-4">
                  {["Yes", "No"].map(v => (
                    <button key={v} type="button" onClick={() => update("transported", v)}
                      className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all
                        ${form.transported === v
                          ? v === "Yes" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-400 bg-slate-50 text-slate-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}>
                      {v === "Yes" ? "✅ Transported to Hospital" : "❌ Not Transported"}
                    </button>
                  ))}
                </div>

                {form.transported === "Yes" && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField label="Hospital Name" required>
                      <select value={form.hospitalName} onChange={e => update("hospitalName", e.target.value)} className={inputClass}>
                        <option value="">Select hospital</option>
                        {["Southern Philippines Medical Center", "Davao Regional Medical Center", "San Pedro Hospital", "Davao Doctors Hospital", "Others"].map(h => <option key={h}>{h}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Transport Vehicle">
                      <select value={form.transportVehicle} onChange={e => update("transportVehicle", e.target.value)} className={inputClass}>
                        <option value="">Select vehicle</option>
                        {["Ambulance 01", "Ambulance 02", "Rescue Van 01", "Personal Vehicle", "Other"].map(v => <option key={v}>{v}</option>)}
                      </select>
                    </FormField>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Waiver / Consent</label>
                <div className="flex gap-3">
                  {["Signed", "Refused", "N/A"].map(v => (
                    <button key={v} type="button" onClick={() => update("waiverSigned", v)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all
                        ${form.waiverSigned === v
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}>
                      {v}
                    </button>
                  ))}
                </div>
                {form.waiverSigned === "Refused" && (
                  <div className="mt-3">
                    <FormField label="Reason for Refusal">
                      <input type="text" value={form.waiverReason} onChange={e => update("waiverReason", e.target.value)}
                        className={inputClass} placeholder="State reason for waiver refusal" />
                    </FormField>
                  </div>
                )}
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Incident Documentation</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors cursor-pointer">
                  <Camera size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm font-medium">Upload Photos / Documents</p>
                  <p className="text-slate-400 text-xs mt-1">Drag & drop or click to browse · JPG, PNG, PDF supported</p>
                  <button className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                    Browse Files
                  </button>
                </div>
              </div>

              <FormField label="Additional Notes / Remarks">
                <textarea
                  value={form.additionalNotes}
                  onChange={e => update("additionalNotes", e.target.value)}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Any additional information, handover notes, or special circumstances..."
                />
              </FormField>
            </div>
          )}

          {/* STEP 5: Overview / Summary */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-blue-800 text-sm font-semibold mb-1">📋 Report Overview</p>
                <p className="text-blue-600 text-xs">Please review all information before submitting. You can go back to make changes.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Responding Unit Summary */}
                <SummaryCard title="Responding Unit" icon={<Shield size={14} className="text-blue-600" />}>
                  <SummaryRow label="Response No." value={form.responseNumber} />
                  <SummaryRow label="Team" value={form.respondingTeam || "—"} />
                  <SummaryRow label="Vehicle" value={form.vehicle || "—"} />
                  <SummaryRow label="Driver" value={form.driver || "—"} />
                  <SummaryRow label="Main Aider" value={form.mainAider || "—"} />
                  <SummaryRow label="Nature of Call" value={form.natureOfCall} capitalize />
                  <SummaryRow label="Date & Time" value={`${form.dateOfIncident} · ${form.timeOfIncident}`} />
                  <SummaryRow label="Location" value={form.placeOfIncident || "—"} />
                </SummaryCard>

                {/* Patient Info Summary */}
                <SummaryCard title="Patient Information" icon={<User size={14} className="text-green-600" />}>
                  <SummaryRow label="Name" value={form.patientName || "—"} />
                  <SummaryRow label="Age / Gender" value={`${form.age || "—"} / ${form.gender || "—"}`} />
                  <SummaryRow label="Civil Status" value={form.civilStatus || "—"} />
                  <SummaryRow label="Address" value={form.address || "—"} />
                  <SummaryRow label="Contact Person" value={form.contactPerson || "—"} />
                  <SummaryRow label="Contact No." value={form.contactNumber || "—"} />
                </SummaryCard>

                {/* Assessment Summary */}
                <SummaryCard title="Field Assessment" icon={<Activity size={14} className="text-orange-600" />}>
                  <SummaryRow label="Initial Assessment" value={form.initialAssessment || "—"} />
                  <SummaryRow label="Condition" value={form.patientCondition || "—"} />
                  <SummaryRow label="Injuries" value={(form.injuryType || []).join(", ") || "None specified"} />
                  <SummaryRow label="Blood Pressure" value={form.bloodPressure || "—"} />
                  <SummaryRow label="Pulse Rate" value={form.pulseRate || "—"} />
                  <SummaryRow label="Temperature" value={form.temperature || "—"} />
                  <SummaryRow label="GCS" value={form.gcsScore || "—"} />
                </SummaryCard>

                {/* Transport Summary */}
                <SummaryCard title="Response & Transport" icon={<Ambulance size={14} className="text-violet-600" />}>
                  <SummaryRow label="Transported" value={form.transported || "—"} />
                  <SummaryRow label="Hospital" value={form.hospitalName || "—"} />
                  <SummaryRow label="Transport Vehicle" value={form.transportVehicle || "—"} />
                  <SummaryRow label="Waiver" value={form.waiverSigned || "—"} />
                  {form.waiverReason && <SummaryRow label="Waiver Reason" value={form.waiverReason} />}
                  {form.additionalNotes && <SummaryRow label="Notes" value={form.additionalNotes} />}
                </SummaryCard>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button
            onClick={prevStep}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={14} /> Previous
          </button>

          <div className="flex items-center gap-2">
            {step === 5 ? (
              <>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
                  <Save size={14} /> Save Draft
                </button>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors">
                  <Download size={14} /> Export PDF
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                  ) : (
                    <><Send size={14} /> Submit Report</>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Next Step <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Reusable components
const inputClass = "w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-all";

function FormField({ label, required, children }) {
  return (
    <div>
      <label className="block text-slate-600 text-xs font-medium mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function SummaryCard({ title, icon, children }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="font-semibold text-slate-800 text-sm">{title}</h4>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, capitalize }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-slate-400 w-28 shrink-0">{label}</span>
      <span className={`text-slate-700 font-medium ${capitalize ? "capitalize" : ""}`}>{value}</span>
    </div>
  );
}