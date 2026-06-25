import React from "react";
import { X, FileText, Edit3, Send } from "lucide-react";

const DISPATCH_STATUSES = {
  SENT: "Sent",
};

const checkbox = (value) =>
  value ? "inline-flex h-4 w-4 items-center justify-center rounded-sm border border-black text-[10px] font-bold" : "inline-flex h-4 w-4 rounded-sm border border-black";

const PreviewField = ({ label, value, className = "", valueClass = "" }) => (
  <div className={`flex min-h-8.5 flex-col border border-black ${className}`}>
    {label ? (
      <div className="border-b border-black px-1 py-0.5 text-[10px] font-bold uppercase leading-none">
        {label}
      </div>
    ) : null}
    <div className={`flex-1 px-1 py-1 text-[11px] leading-tight ${valueClass}`}>
      {value || ""}
    </div>
  </div>
);

const InlineField = ({ label, value, className = "" }) => (
  <div className={`flex items-center gap-1 text-[11px] ${className}`}>
    <span className="font-semibold">{label}</span>
    <span className="min-w-10 border-b border-black px-1">{value || ""}</span>
  </div>
);

const CheckboxLabel = ({ checked, label }) => (
  <label className="flex items-center gap-1 text-[11px] leading-tight">
    <span className={checked ? checkbox(true) : checkbox(false)}>{checked ? "✓" : ""}</span>
    <span>{label}</span>
  </label>
);

const getPatient = (selected, index) => selected?.patients?.[index] || {};

const yes = (val) => val === true || val === "yes" || val === "Yes" || val === "+" || val === "positive";

export default function DispatchPreviewModal({
  selected,
  setSelected,
  canCreate,
  edit,
  openPCR,
  send,
  findLinkedPCR,
}) {
  if (!selected) return null;

  const patient1 = getPatient(selected, 0);
  const patient2 = getPatient(selected, 1);
  const patient3 = getPatient(selected, 2);

  const patientCount =
    selected.numberOfPatients ||
    selected.patientCount ||
    selected.patients?.length ||
    "";

  const incidentTypes = [
    ...(selected.natureTypes || []),
    selected.otherMedical,
    selected.otherTrauma,
    selected.otherNature,
  ]
    .filter(Boolean)
    .join(", ");

  const renderPatientBlock = (patient, idx) => (
    <div key={idx} className="grid grid-cols-1 border-r border-black last:border-r-0">
      <div className="border-b border-black px-2 py-1 text-center text-[12px] font-bold uppercase">
        Patient {idx + 1}
      </div>

      <div className="space-y-0.5 p-2 text-[11px]">
        <div className="grid grid-cols-2 gap-1">
          <InlineField label="Name:" value={patient.name} />
          <InlineField label="Age:" value={patient.age} />
        </div>

        <div className="grid grid-cols-2 gap-1">
          <InlineField label="Birthdate:" value={patient.birthdate} />
          <InlineField label="Gender:" value={patient.gender} />
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">Address:</div>
          <div className="min-h-5 border-b border-black px-1 text-[11px]">
            {patient.address || ""}
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">Assessment Findings:</div>
          <div className="min-h-18 border border-black p-1 text-[11px] whitespace-pre-wrap">
            {patient.assessmentFindings || patient.assessment || ""}
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">Vital Signs:</div>
          <div className="grid grid-cols-3 gap-1">
            <InlineField label="BP:" value={patient.bp} />
            <InlineField label="PR:" value={patient.pr} />
            <InlineField label="RR:" value={patient.rr} />
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <InlineField label="Temp:" value={patient.temp} />
            <InlineField label="O2 Sat:" value={patient.o2sat || patient.o2Sat} />
            <InlineField label="GCS:" value={patient.gcs} />
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">General Status:</div>
          <div className="grid grid-cols-2 gap-y-1">
            <CheckboxLabel checked={patient.generalStatus === "Conscious"} label="Conscious" />
            <CheckboxLabel checked={patient.generalStatus === "Unconscious"} label="Unconscious" />
            <CheckboxLabel checked={patient.mobility === "Ambulatory"} label="Ambulatory" />
            <CheckboxLabel checked={patient.mobility === "Non-Ambulatory"} label="Non-Ambulatory" />
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">If Vehicular Accident:</div>
          <div className="grid grid-cols-2 gap-y-1">
            <CheckboxLabel checked={patient.vehicularRole === "Driver"} label="Driver" />
            <CheckboxLabel checked={patient.vehicularRole === "Passenger"} label="Passenger" />
            <CheckboxLabel checked={patient.vehicularRole === "Pedestrian"} label="Pedestrian" />
            <CheckboxLabel checked={yes(patient.helmet)} label="Helmet (+/-)" />
            <CheckboxLabel checked={yes(patient.alcoholBreath)} label="Alcohol Breath (+/-)" />
            <CheckboxLabel checked={yes(patient.driversLicense)} label="Driver's License (+/-)" />
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">If Pregnant:</div>
          <div className="grid grid-cols-3 gap-1">
            <InlineField label="G:" value={patient.g} />
            <InlineField label="P:" value={patient.p} />
            <InlineField label="T:" value={patient.t} />
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <InlineField label="P:" value={patient.p2} />
            <InlineField label="A:" value={patient.a} />
            <InlineField label="L:" value={patient.l} />
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <InlineField label="LMP:" value={patient.lmp} />
            <InlineField label="AOG:" value={patient.aog} />
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <InlineField label="EDC:" value={patient.edc} />
            <InlineField label="FHT:" value={patient.fht} />
          </div>
          <div className="mt-1">
            <InlineField label="IE / BOW (+/-):" value={patient.ie || patient.bow} />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border p-4 print:hidden">
          <div>
            <h2 className="font-bold">
              {selected.responseNumber || "Dispatch Form Preview"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selected.status || "Draft"} · {selected.placeOfIncident || "No location entered"}
            </p>
          </div>

          <button
            onClick={() => setSelected(null)}
            className="rounded-lg p-2 hover:bg-secondary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Document Body */}
        <div className="overflow-auto bg-muted/20 p-4">
          <div className="mx-auto w-full max-w-275 rounded-lg bg-white p-4 text-black shadow">
            {/* Paper */}
            <div className="border border-black">
              {/* Header */}
              <div className="border-b border-black px-4 py-3 text-center">
                <div className="text-[12px] leading-tight">Republic of the Philippines</div>
                <div className="text-[12px] leading-tight">Province of Isabela</div>
                <div className="text-[24px] font-bold uppercase leading-tight">
                  Municipality of Echague
                </div>
                <div className="mt-1 text-[24px] font-serif italic leading-tight">
                  Echague Rescue Emergency Medical Service
                </div>
                <div className="text-[20px] font-bold uppercase">Dispatch Form</div>
              </div>

              {/* Response Row */}
              <div className="grid grid-cols-12 border-b border-black text-[11px]">
                <div className="col-span-6 border-r border-black p-1">
                  <span className="font-bold">Response No.:</span>{" "}
                  {selected.responseNumber || ""}
                </div>
                <div className="col-span-6 p-1">
                  <span className="font-bold">Number of Patient/s/Victim:</span>{" "}
                  {patientCount}
                </div>
              </div>

              {/* Team row */}
              <div className="grid grid-cols-5 border-b border-black">
                <PreviewField label="Team" value={selected.team} />
                <PreviewField label="Vehicle" value={selected.vehicle} />
                <PreviewField label="Driver" value={selected.driver} />
                <PreviewField label="Group Leader" value={selected.groupLeader} />
                <PreviewField label="Assistant Aider" value={selected.assistantAider} />
              </div>

              {/* Caller Data */}
              <div className="border-b border-black">
                <div className="border-b border-black py-1 text-center text-[12px] font-bold uppercase">
                  Caller Data
                </div>
                <div className="grid grid-cols-3">
                  <PreviewField label="Name" value={selected.callerName} />
                  <PreviewField label="Address" value={selected.callerAddress} />
                  <PreviewField label="Contact Number" value={selected.callerContact} />
                </div>
              </div>

              {/* Nature of Call */}
              <div className="border-b border-black">
                <div className="border-b border-black py-1 text-center text-[12px] font-bold uppercase">
                  Nature of Call
                </div>

                <div className="grid grid-cols-12">
                  {/* Left side */}
                  <div className="col-span-8 border-r border-black p-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-y-1">
                      <CheckboxLabel checked={selected.conduction} label="Conduction" />
                      <CheckboxLabel checked={selected.transport} label="Transport" />

                      <CheckboxLabel checked={selected.medical} label="Medical" />
                      <CheckboxLabel checked={selected.pediatric} label="Pediatric" />

                      <CheckboxLabel checked={selected.psychiatric} label="Psychiatric" />
                      <CheckboxLabel checked={selected.surgical} label="Surgical" />

                      <CheckboxLabel checked={selected.obstetrical} label="Obstetrical" />
                      <CheckboxLabel checked={selected.drowning} label="Drowning" />

                      <CheckboxLabel checked={selected.trauma} label="Trauma" />
                      <CheckboxLabel checked={selected.fall} label="Fall" />

                      <CheckboxLabel checked={selected.electrocution} label="Electrocution" />
                      <CheckboxLabel checked={selected.domesticViolence} label="Domestic Violence" />

                      <CheckboxLabel checked={selected.waterRescueIncident} label="Water Rescue Incident" />
                      <CheckboxLabel checked={selected.fireIncident} label="Fire Incident" />

                      <CheckboxLabel checked={selected.assault} label="Assault" />
                      <CheckboxLabel checked={selected.animalBite} label="Animal Bite" />

                      <CheckboxLabel checked={selected.motorVehicleCrash} label="Motor Vehicle Crash" />
                    </div>

                    <div className="mt-2 border-t border-black pt-2">
                      <div className="text-[11px] font-semibold">Other / Selected Incident Types:</div>
                      <div className="min-h-8 whitespace-pre-wrap text-[11px]">
                        {incidentTypes}
                      </div>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="col-span-4 p-2 text-[11px]">
                    <div className="space-y-2">
                      <div>
                        <div className="mb-1 font-semibold">Nature:</div>
                        <div className="flex gap-4">
                          <CheckboxLabel checked={selected.injuryNature === "Self-Inflicted"} label="Self-Inflicted" />
                          <CheckboxLabel checked={selected.injuryNature === "Accidental"} label="Accidental" />
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold">If ingestion:</div>
                        <div className="min-h-7 border-b border-black px-1 py-1">
                          {selected.ingestionDetails || ""}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold">Quantity:</div>
                        <div className="min-h-6 border-b border-black px-1 py-1">
                          {selected.ingestionQuantity || ""}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold">If Fall:</div>
                        <div className="min-h-6 border-b border-black px-1 py-1">
                          {selected.fallDetails || ""}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Accident row */}
              <div className="grid grid-cols-12 border-b border-black text-[11px]">
                <div className="col-span-2 border-r border-black p-1">
                  <CheckboxLabel checked={selected.selfAccident} label="Self-Accident" />
                </div>
                <div className="col-span-2 border-r border-black p-1">
                  <CheckboxLabel checked={selected.collision} label="Collision" />
                </div>
                <div className="col-span-8 p-1">
                  <span className="font-bold">Vehicle involve:</span>{" "}
                  {selected.vehicleInvolve || selected.vehicleInvolved || ""}
                </div>
              </div>

              {/* Incident details */}
              <div className="grid grid-cols-1 border-b border-black">
                <PreviewField label="Place of Incident" value={selected.placeOfIncident} />
                <PreviewField label="Time of Incident" value={selected.timeOfIncident} />
                <PreviewField label="Date of Incident" value={selected.dateOfIncident} />
              </div>

              {/* Assistance needed */}
              <div className="border-b border-black p-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-bold uppercase">Assistance Needed</span>
                  <CheckboxLabel checked={selected.assistancePNP} label="PNP" />
                  <CheckboxLabel checked={selected.assistanceBFP} label="BFP" />
                  <CheckboxLabel checked={selected.assistanceBrgyOfficials} label="Brgy. Officials" />
                  <CheckboxLabel checked={selected.assistanceOthers} label="Others" />
                  <span className="min-w-35 border-b border-black px-1">
                    {selected.assistanceOthersText || ""}
                  </span>
                </div>
              </div>

              {/* Dispatch Times */}
              <div className="border-b border-black">
                <div className="grid grid-cols-6 text-[11px]">
                  <PreviewField label="Dispatched Time" value={selected.dispatchedTime} />
                  <PreviewField label="Arrival at the Scene" value={selected.arrivalAtScene} />
                  <PreviewField label="Departure at the Scene" value={selected.departureAtScene} />
                  <PreviewField label="Arrival at the Hospital" value={selected.arrivalAtHospital} />
                  <PreviewField label="Departure at the Hospital" value={selected.departureAtHospital} />
                  <PreviewField label="Arrival at the Office" value={selected.arrivalAtOffice} />
                </div>
              </div>

              {/* Hospital */}
              <div className="border-b border-black p-2 text-[11px]">
                <span className="font-bold">Name of Hospital:</span>{" "}
                {selected.hospitalName || selected.nameOfHospital || ""}
              </div>

              {/* Patients */}
              <div>
                <div className="border-b border-black py-1 text-center text-[14px] font-bold uppercase">
                  Patient/s Data
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3">
                  {renderPatientBlock(patient1, 0)}
                  {renderPatientBlock(patient2, 1)}
                  {renderPatientBlock(patient3, 2)}
                </div>
              </div>

              {/* Footer */}
              <div className="grid grid-cols-2 border-t border-black">
                <div className="border-r border-black p-2 text-[11px]">
                  <span className="font-bold">Dispatcher/s:</span>{" "}
                  {selected.dispatchers || selected.dispatcher || ""}
                </div>
                <div className="p-2 text-[11px]">
                  <span className="font-bold">Date:</span>{" "}
                  {selected.dispatchDate || selected.date || ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4 print:hidden">
          {canCreate && (
            <button
              onClick={() => edit(selected)}
              className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs"
            >
              <Edit3 size={14} />
              Edit Dispatch
            </button>
          )}

          <button
            onClick={() => openPCR(selected)}
            className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs text-white"
          >
            <FileText size={14} />
            Open Linked PCR
          </button>

          {canCreate &&
            selected.status !== DISPATCH_STATUSES.SENT &&
            !findLinkedPCR(selected) && (
              <button
                onClick={() => send(selected)}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white"
              >
                <Send size={14} />
                Send to Responding Team
              </button>
            )}
        </div>
      </div>
    </div>
  );
}