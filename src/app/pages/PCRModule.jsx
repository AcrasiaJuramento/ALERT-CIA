import { useState } from 'react';
import {
  CheckCircle2, ChevronRight, ChevronLeft, Radio, User, Activity,
  Truck, ClipboardList, Upload, FileText, Save, Download, Send
} from 'lucide-react';

const steps = [
  { id: 1, label: 'Responding Unit', icon: Radio },
  { id: 2, label: 'Patient Info', icon: User },
  { id: 3, label: 'Assessment', icon: Activity },
  { id: 4, label: 'Response & Transport', icon: Truck },
  { id: 5, label: 'Report Overview', icon: ClipboardList },
];

const inputClass = 'w-full px-3 py-2.5 bg-input-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all';
const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';
const selectClass = 'w-full px-3 py-2.5 bg-input-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500 transition-all';

function FormGroup({ label, children }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="col-span-full pb-1 border-b border-border mb-1">
      <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">{children}</span>
    </div>
  );
}

function SummarySection({ title, items }) {
  return (
    <div className="bg-secondary/50 border border-border rounded-xl p-4">
      <h4 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">{title}</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {items.map(({ label, value }) => (
          <div key={label}>
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{label}</div>
            <div className="text-sm text-foreground font-medium">{value || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PCRModule() {
  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    // Step 1
    responseNumber: 'RES-2024-' + Math.floor(Math.random() * 9000 + 1000),
    respondingTeam: '',
    vehicle: '',
    driver: '',
    mainAider: '',
    assistantAider: '',
    natureOfCall: 'emergency',
    dateOfIncident: '2024-03-14',
    timeOfIncident: '',
    placeOfIncident: '',
    departureTime: '',
    arrivalAtScene: '',
    departureFromScene: '',
    // Step 2
    patientName: '',
    age: '',
    birthday: '',
    gender: '',
    civilStatus: '',
    address: '',
    contactPerson: '',
    contactNumber: '',
    // Step 3
    initialAssessment: '',
    patientCondition: '',
    injuryType: '',
    bp: '',
    hr: '',
    rr: '',
    temp: '',
    spo2: '',
    observations: '',
    // Step 4
    transportedToHospital: 'yes',
    hospitalName: '',
    transportVehicle: '',
    waiverSigned: false,
    additionalNotes: '',
  });

  const update = (key, value ) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep(s => s + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(s => s - 1);
  };

  const handleSubmit = () => setSubmitted(true);

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-full p-6 bg-background transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>PCR Report Submitted</h2>
          <p className="text-muted-foreground mb-2 text-sm">Report <span className="text-blue-400 font-mono">{form.responseNumber}</span> has been submitted successfully.</p>
          <p className="text-muted-foreground/60 text-xs mb-8">Pending admin review and verification.</p>
          <div className="flex gap-3 justify-center">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Export PDF
            </button>
            <button
              onClick={() => { setSubmitted(false); setCurrentStep(1); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all"
            >
              New PCR Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-4xl mx-auto bg-background min-h-full transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-blue-400" />
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Patient Care Report (PCR)
          </h1>
        </div>
        <p className="text-muted-foreground text-xs">Response No: <span className="text-blue-400 font-mono">{form.responseNumber}</span></p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 relative">
        {/* Progress line */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-border" />
        <div
          className="absolute top-4 left-0 h-0.5 bg-blue-500 transition-all duration-500"
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        />
        {steps.map(({ id, label, icon: Icon }) => (
          <div key={id} className="relative flex flex-col items-center gap-2 z-10">
            <button
              onClick={() => id < currentStep && setCurrentStep(id)}
              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                id < currentStep
                  ? 'bg-blue-600 border-blue-600 cursor-pointer'
                  : id === currentStep
                  ? 'bg-card border-blue-500 ring-2 ring-blue-500/30'
                  : 'bg-secondary border-border cursor-default'
              }`}
            >
              {id < currentStep ? (
                <CheckCircle2 className="w-4 h-4 text-white" />
              ) : (
                <Icon className={`w-3.5 h-3.5 ${id === currentStep ? 'text-blue-400' : 'text-muted-foreground'}`} />
              )}
            </button>
            <span className={`text-[10px] font-medium text-center hidden sm:block ${
              id === currentStep ? 'text-blue-400' : id < currentStep ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Form Card */}
      <div className="bg-card border border-border rounded-2xl p-6 transition-colors duration-300">
        <div className="flex items-center gap-2 mb-5">
          {(() => {
            const step = steps.find(s => s.id === currentStep);
            const Icon = step.icon;
            return (
              <>
                <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-lg flex items-center justify-center">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Step {currentStep}: {step.label}
                  </h2>
                </div>
              </>
            );
          })()}
        </div>

        {/* Step 1: Responding Unit */}
        {currentStep === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionTitle>Unit Information</SectionTitle>
            <FormGroup label="Response Number">
              <input value={form.responseNumber} readOnly className={`${inputClass} opacity-60`} />
            </FormGroup>
            <FormGroup label="Responding Team *">
              <select value={form.respondingTeam} onChange={e => update('respondingTeam', e.target.value)} className={selectClass}>
                <option value="">Select Team</option>
                {['Alpha Team', 'Bravo Team', 'Charlie Team', 'Delta Team', 'Echo Team'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </FormGroup>
            <FormGroup label="Vehicle *">
              <input placeholder="e.g. Ambulance-01 / RRV-03" value={form.vehicle} onChange={e => update('vehicle', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Driver *">
              <input placeholder="Driver name" value={form.driver} onChange={e => update('driver', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Main Aider *">
              <input placeholder="Main aider / lead responder" value={form.mainAider} onChange={e => update('mainAider', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Assistant Aider">
              <input placeholder="Assistant aider name" value={form.assistantAider} onChange={e => update('assistantAider', e.target.value)} className={inputClass} />
            </FormGroup>

            <SectionTitle>Nature of Call</SectionTitle>
            <div className="col-span-full grid grid-cols-2 gap-3">
              {['emergency', 'conduction'].map(type => (
                <label
                  key={type}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    form.natureOfCall === type
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                      : 'bg-secondary/50 border-border text-muted-foreground hover:border-blue-500/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="natureOfCall"
                    value={type}
                    checked={form.natureOfCall === type}
                    onChange={e => update('natureOfCall', e.target.value)}
                    className="accent-blue-500"
                  />
                  <div>
                    <div className="text-sm font-semibold capitalize text-foreground">{type}</div>
                    <div className="text-xs opacity-70">{type === 'emergency' ? 'Immediate emergency response' : 'Hospital/facility conduction'}</div>
                  </div>
                </label>
              ))}
            </div>

            <SectionTitle>Incident Details</SectionTitle>
            <FormGroup label="Date of Incident *">
              <input type="date" value={form.dateOfIncident} onChange={e => update('dateOfIncident', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Time of Incident *">
              <input type="time" value={form.timeOfIncident} onChange={e => update('timeOfIncident', e.target.value)} className={inputClass} />
            </FormGroup>
            <div className="col-span-full">
              <FormGroup label="Place of Incident *">
                <input placeholder="Full address or barangay location" value={form.placeOfIncident} onChange={e => update('placeOfIncident', e.target.value)} className={inputClass} />
              </FormGroup>
            </div>

            <SectionTitle>Timeline</SectionTitle>
            <FormGroup label="Departure Time">
              <input type="time" value={form.departureTime} onChange={e => update('departureTime', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Arrival at Scene">
              <input type="time" value={form.arrivalAtScene} onChange={e => update('arrivalAtScene', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Departure from Scene">
              <input type="time" value={form.departureFromScene} onChange={e => update('departureFromScene', e.target.value)} className={inputClass} />
            </FormGroup>
          </div>
        )}

        {/* Step 2: Patient Information */}
        {currentStep === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionTitle>Patient Details</SectionTitle>
            <div className="col-span-full">
              <FormGroup label="Patient Name *">
                <input placeholder="Last Name, First Name MI." value={form.patientName} onChange={e => update('patientName', e.target.value)} className={inputClass} />
              </FormGroup>
            </div>
            <FormGroup label="Age *">
              <input type="number" placeholder="Age" value={form.age} onChange={e => update('age', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Birthday">
              <input type="date" value={form.birthday} onChange={e => update('birthday', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Gender *">
              <select value={form.gender} onChange={e => update('gender', e.target.value)} className={selectClass}>
                <option value="">Select gender</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </FormGroup>
            <FormGroup label="Civil Status">
              <select value={form.civilStatus} onChange={e => update('civilStatus', e.target.value)} className={selectClass}>
                <option value="">Select status</option>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
                <option>Separated</option>
              </select>
            </FormGroup>
            <div className="col-span-full">
              <FormGroup label="Home Address">
                <input placeholder="Complete address" value={form.address} onChange={e => update('address', e.target.value)} className={inputClass} />
              </FormGroup>
            </div>
            <SectionTitle>Emergency Contact</SectionTitle>
            <FormGroup label="Contact Person">
              <input placeholder="Name of emergency contact" value={form.contactPerson} onChange={e => update('contactPerson', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Contact Number">
              <input type="tel" placeholder="09XXXXXXXXX" value={form.contactNumber} onChange={e => update('contactNumber', e.target.value)} className={inputClass} />
            </FormGroup>
          </div>
        )}

        {/* Step 3: Assessment */}
        {currentStep === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionTitle>Field Assessment</SectionTitle>
            <FormGroup label="Initial Assessment *">
              <select value={form.initialAssessment} onChange={e => update('initialAssessment', e.target.value)} className={selectClass}>
                <option value="">Select assessment</option>
                <option>Conscious & Alert</option>
                <option>Unconscious</option>
                <option>Semi-conscious</option>
                <option>Unresponsive</option>
                <option>Deceased</option>
              </select>
            </FormGroup>
            <FormGroup label="Patient Condition *">
              <select value={form.patientCondition} onChange={e => update('patientCondition', e.target.value)} className={selectClass}>
                <option value="">Select condition</option>
                <option>Stable</option>
                <option>Critical</option>
                <option>Serious</option>
                <option>Fair</option>
                <option>Poor</option>
              </select>
            </FormGroup>
            <div className="col-span-full">
              <FormGroup label="Injury Type / Chief Complaint">
                <input placeholder="e.g. Laceration, fracture, cardiac arrest..." value={form.injuryType} onChange={e => update('injuryType', e.target.value)} className={inputClass} />
              </FormGroup>
            </div>

            <SectionTitle>Vital Signs</SectionTitle>
            <FormGroup label="Blood Pressure (mmHg)">
              <input placeholder="e.g. 120/80" value={form.bp} onChange={e => update('bp', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Heart Rate (bpm)">
              <input type="number" placeholder="e.g. 80" value={form.hr} onChange={e => update('hr', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Respiratory Rate (/min)">
              <input type="number" placeholder="e.g. 18" value={form.rr} onChange={e => update('rr', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="Temperature (°C)">
              <input type="number" placeholder="e.g. 36.5" step="0.1" value={form.temp} onChange={e => update('temp', e.target.value)} className={inputClass} />
            </FormGroup>
            <FormGroup label="SpO2 (%)">
              <input type="number" placeholder="e.g. 98" value={form.spo2} onChange={e => update('spo2', e.target.value)} className={inputClass} />
            </FormGroup>

            <div className="col-span-full">
              <FormGroup label="Field Officer Observations">
                <textarea
                  rows={4}
                  placeholder="Describe patient condition, circumstances, interventions done on scene..."
                  value={form.observations}
                  onChange={e => update('observations', e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </FormGroup>
            </div>

            <div className="col-span-full p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-start gap-2">
                <Activity className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400">
                  This assessment will be submitted to the dispatch office and MDRRMO administration for verification and quality control.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Response & Transport */}
        {currentStep === 4 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionTitle>Hospital Transport</SectionTitle>
            <div className="col-span-full">
              <label className={labelClass}>Transported to Hospital? *</label>
              <div className="grid grid-cols-2 gap-3">
                {['yes', 'no'].map(val => (
                  <label
                    key={val}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      form.transportedToHospital === val
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                        : 'bg-secondary/50 border-border text-muted-foreground hover:border-blue-500/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="transported"
                      value={val}
                      checked={form.transportedToHospital === val}
                      onChange={e => update('transportedToHospital', e.target.value)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm font-semibold capitalize text-foreground">{val === 'yes' ? 'Yes — Transported' : 'No — Refused / On-scene care'}</span>
                  </label>
                ))}
              </div>
            </div>

            {form.transportedToHospital === 'yes' && (
              <>
                <FormGroup label="Hospital Name *">
                  <input placeholder="e.g. Echague District Hospital / ISU Medical" value={form.hospitalName} onChange={e => update('hospitalName', e.target.value)} className={inputClass} />
                </FormGroup>
                <FormGroup label="Transport Vehicle">
                  <input placeholder="Vehicle used for transport" value={form.transportVehicle} onChange={e => update('transportVehicle', e.target.value)} className={inputClass} />
                </FormGroup>
              </>
            )}

            <SectionTitle>Waiver</SectionTitle>
            <div className="col-span-full">
              <label className={`flex items-start gap-3 p-4 bg-secondary/50 border border-border rounded-xl cursor-pointer transition-all ${
                form.waiverSigned ? 'border-green-500/40 bg-green-500/5' : ''
              }`}>
                <input
                  type="checkbox"
                  checked={form.waiverSigned}
                  onChange={e => update('waiverSigned', e.target.checked)}
                  className="mt-0.5 accent-green-500 w-4 h-4"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">Waiver/Refusal of Treatment Signed</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Patient or authorized representative has signed the waiver acknowledging the risk and refusing or accepting treatment.
                  </div>
                </div>
              </label>
            </div>

            <SectionTitle>Documentation</SectionTitle>
            <div className="col-span-full">
              <label className={labelClass}>Upload Photos / Documentation</label>
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-blue-500/50 transition-all cursor-pointer bg-secondary/30">
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Drag and drop images here, or click to browse</p>
                <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, PDF up to 10MB each</p>
                <button className="mt-3 px-4 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-xs font-medium transition-all">
                  Choose Files
                </button>
              </div>
            </div>

            <div className="col-span-full">
              <FormGroup label="Additional Notes">
                <textarea
                  rows={3}
                  placeholder="Any additional information or notes..."
                  value={form.additionalNotes}
                  onChange={e => update('additionalNotes', e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </FormGroup>
            </div>
          </div>
        )}

        {/* Step 5: Report Overview */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <p className="text-xs text-green-400">
                Review all information below before submitting. You can go back to any step to make changes.
              </p>
            </div>

            <SummarySection
              title="Responding Unit"
              items={[
                { label: 'Response Number', value: form.responseNumber },
                { label: 'Team', value: form.respondingTeam },
                { label: 'Vehicle', value: form.vehicle },
                { label: 'Driver', value: form.driver },
                { label: 'Main Aider', value: form.mainAider },
                { label: 'Assistant Aider', value: form.assistantAider },
                { label: 'Nature of Call', value: form.natureOfCall },
                { label: 'Date', value: form.dateOfIncident },
                { label: 'Time', value: form.timeOfIncident },
                { label: 'Location', value: form.placeOfIncident },
                { label: 'Departure', value: form.departureTime },
                { label: 'Arrival', value: form.arrivalAtScene },
              ]}
            />

            <SummarySection
              title="Patient Information"
              items={[
                { label: 'Patient Name', value: form.patientName },
                { label: 'Age', value: form.age },
                { label: 'Gender', value: form.gender },
                { label: 'Civil Status', value: form.civilStatus },
                { label: 'Address', value: form.address },
                { label: 'Contact Person', value: form.contactPerson },
                { label: 'Contact Number', value: form.contactNumber },
              ]}
            />

            <SummarySection
              title="Assessment"
              items={[
                { label: 'Initial Assessment', value: form.initialAssessment },
                { label: 'Condition', value: form.patientCondition },
                { label: 'Injury Type', value: form.injuryType },
                { label: 'Blood Pressure', value: form.bp ? `${form.bp} mmHg` : '' },
                { label: 'Heart Rate', value: form.hr ? `${form.hr} bpm` : '' },
                { label: 'Temperature', value: form.temp ? `${form.temp} °C` : '' },
                { label: 'SpO2', value: form.spo2 ? `${form.spo2}%` : '' },
              ]}
            />

            <SummarySection
              title="Transport & Response"
              items={[
                { label: 'Transported', value: form.transportedToHospital === 'yes' ? 'Yes' : 'No' },
                { label: 'Hospital', value: form.hospitalName },
                { label: 'Transport Vehicle', value: form.transportVehicle },
                { label: 'Waiver Signed', value: form.waiverSigned ? 'Yes' : 'No' },
              ]}
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-5 py-2.5 bg-secondary hover:bg-secondary/80 disabled:opacity-40 text-foreground rounded-xl text-sm font-medium transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-sm font-medium transition-all">
              <Save className="w-4 h-4" />
              Save Draft
            </button>
            {currentStep === 5 ? (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-all"
              >
                <Send className="w-4 h-4" />
                Submit Report
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Next Step
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
);
}