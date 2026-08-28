import React from "react";
import { createPortal } from "react-dom";
import { X, FileText, Edit3, Send, Download } from "lucide-react";
import { formatLongDate } from "../utils/dateFormat";
import bagongPilipinasAsset from "../../assets/bagong-pilipinas.png?inline";
import municipalSealAsset from "../../assets/municipal-seal.png?inline";
import rescueLogoAsset from "../../assets/rescue-logo.png?inline";

const isPcrCompleted = (record) =>
  String(record?.status || "").includes("PCR Completed") ||
  String(record?.localStatus || "").includes("PCR Completed") ||
  ["Submitted", "Submitted on Device", "Submitted Locally", "Verified"].includes(record?.status) ||
  ["Submitted on Device", "Submitted Locally", "Verified"].includes(record?.localStatus);

const checkbox = (value) =>
  value
    ? "inline-flex h-4 w-4 items-center justify-center rounded-sm border border-black text-[10px] font-bold"
    : "inline-flex h-4 w-4 rounded-sm border border-black";

const PreviewField = ({ label, value, className = "", valueClass = "" }) => (
  <div
    className={`dispatch-field flex min-h-8.5 flex-col border border-black ${className}`}
  >
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
  <div
    className={`dispatch-inline-field flex items-center gap-1 text-[11px] ${className}`}
  >
    <span className="font-semibold">{label}</span>
    <span className="min-w-10 border-b border-black px-1">{value || ""}</span>
  </div>
);

const CheckboxLabel = ({ checked, label }) => (
  <label className="dispatch-choice-label flex items-center gap-1 text-[11px] leading-tight">
    <span className={checked ? checkbox(true) : checkbox(false)}>
      {checked ? "✓" : ""}
    </span>
    <span>{label}</span>
  </label>
);

const LineValueLabel = ({ label, value }) => (
  <div className="dispatch-inline-field flex items-center gap-1 text-[11px]">
    <span className="shrink-0 font-semibold">{label}</span>
    <span className="min-w-8 flex-1 border-b border-black px-1 text-center font-bold">
      {value || ""}
    </span>
  </div>
);

const PatientInlineField = ({ label, value, className = "" }) => (
  <div className={`dispatch-patient-inline-field flex min-w-0 items-center gap-1 text-[11px] ${className}`}>
    <span className="shrink-0 font-semibold">{label}</span>
    <span className="min-w-0 flex-1 border-b border-black px-1 leading-tight">
      {value || ""}
    </span>
  </div>
);

const IncidentRowField = ({ label, value }) => (
  <div className="grid min-h-6 grid-cols-[35mm_minmax(0,1fr)] border-b border-black text-[11px] last:border-b-0">
    <div className="flex items-center border-r border-black px-1 font-bold uppercase">
      {label}
    </div>
    <div className="flex items-center px-1">
      <span className="min-h-4 w-full px-1">{value || ""}</span>
    </div>
  </div>
);

const getPatient = (selected, index) => selected?.patients?.[index] || {};

const compactDate = (value) => {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : String(value);
};
const hasNature = (record, label, legacyKey) =>
  Boolean(record?.[legacyKey]) || (record?.natureTypes || []).includes(label);
const hasAssistance = (record, label, legacyKey) =>
  Boolean(record?.[legacyKey]) ||
  (record?.assistanceNeeded || []).includes(label);
const patientChecked = (patient, booleanKey, legacyKey, legacyValue) =>
  Boolean(patient?.[booleanKey]) || patient?.[legacyKey] === legacyValue;
const plusMinusNa = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["+", "positive", "yes"].includes(normalized)) return "+";
  if (["-", "negative", "no"].includes(normalized)) return "-";
  if (["n-a", "n/a", "na", "unknown", "not applicable"].includes(normalized)) return "N-A";
  return value || "";
};

export default function DispatchPreviewModal({
  selected,
  setSelected,
  canCreate,
  edit,
  openPCR,
  send,
  findLinkedPCR,
}) {
  const paperRef = React.useRef(null);
  // const autoDownloadKeyRef = React.useRef("");
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    if (!selected) return undefined;
    const closeOnEscape = (event) =>
      event.key === "Escape" && setSelected(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected, setSelected]);

  const downloadPdf = React.useCallback(async () => {
    if (!paperRef.current || exporting) return;

    setExporting(true);

    try {
      await document.fonts?.ready;

      // Wait for all preview images.
      await Promise.all(
        [...paperRef.current.querySelectorAll("img")].map((image) => {
          if (image.complete && image.naturalWidth > 0) {
            return image.decode?.().catch(() => undefined);
          }

          return new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }),
      );

      const printStyle = document.createElement("style");
      printStyle.id = "dispatch-print-style";

      printStyle.textContent = `
      @media print {
        @page {
          size: 215.9mm 330.2mm;
          margin: 0;
        }

        .dispatch-patient-grid {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          width: 100% !important;
        }

        .dispatch-patient-grid > .dispatch-patient-block {
          min-width: 0 !important;
          width: 100% !important;
        }

        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          width: 215.9mm !important;
          min-height: 330.2mm !important;
          background: #fff !important;

          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /*
         * Hide the entire application while preserving
         * the actual rendered preview styles.
         */
        body > * {
          visibility: hidden !important;
        }

        /*
         * The portal containing the modal must remain visible
         * long enough for the selected form to print.
         */
        .fixed.inset-0 {
          visibility: hidden !important;
        }

        .fixed.inset-0 .dispatch-official-form {
          visibility: visible !important;
        }

        /*
         * Hide everything around the actual paper.
         */
        .dispatch-official-form,
        .dispatch-official-form * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /*
         * Keep exact physical dimensions.
         */
        .dispatch-official-form {
          width: 215.9mm !important;
          min-width: 215.9mm !important;
          height: 330.2mm !important;
          min-height: 330.2mm !important;

          margin: 0 !important;
          padding: 12.7mm !important;

          position: absolute !important;
          left: 0 !important;
          top: 0 !important;

          background: #fff !important;
          box-shadow: none !important;
          transform: none !important;

          overflow: hidden !important;
        }

        /*
         * Preserve the patient 3-column layout.
         */
        .dispatch-official-form .md\\\\:grid-cols-3 {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }

        /*
         * Preserve all grid layouts used by the dispatch form.
         */
        .dispatch-official-form .grid {
          display: grid !important;
        }

        /*
         * Preserve background colors.
         */
        .dispatch-official-form *,
        .dispatch-official-form {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /*
         * Hide screen-only controls.
         */
        .print\\\\:hidden {
          display: none !important;
        }

        /*
         * Remove shadows only.
         */
        .dispatch-official-form.shadow,
        .dispatch-official-form .shadow,
        .dispatch-official-form .shadow-lg,
        .dispatch-official-form .shadow-xl,
        .dispatch-official-form .shadow-2xl {
          box-shadow: none !important;
        }
      }
    `;

      document.head.appendChild(printStyle);

      // Give the browser a complete layout/paint pass.
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      window.focus();
      window.print();

      // Clean up after print dialog closes.
      const cleanup = () => {
        printStyle.remove();
        window.removeEventListener("afterprint", cleanup);
      };

      window.addEventListener("afterprint", cleanup, { once: true });
    } catch (error) {
      console.error("Dispatch PDF export failed:", error);

      throw error;
    } finally {
      setExporting(false);
    }
  }, [exporting, selected]);

  if (!selected) return null;

  const patient1 = getPatient(selected, 0);
  const patient2 = getPatient(selected, 1);
  const patient3 = getPatient(selected, 2);
  const linkedPcr =
    selected.linkedPcr || selected.pcr || findLinkedPCR?.(selected);

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
    <div
      key={idx}
      className="dispatch-patient-block grid grid-cols-1 border-r border-black last:border-r-0"
    >
      <div className="dispatch-patient-title border-b border-black px-2 py-1 text-center font-bold uppercase">
        Patient {idx + 1}
      </div>

      <div className="space-y-0.5 p-2 text-[11px]">
        <div className="grid grid-cols-[minmax(0,1fr)_18mm] gap-1">
          <PatientInlineField label="Name:" value={patient.name} />
          <PatientInlineField label="Age:" value={patient.age} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_24mm] gap-1">
          <PatientInlineField
            label="Birthdate:"
            value={compactDate(patient.birthdate)}
          />
          <PatientInlineField label="Gender:" value={patient.gender} />
        </div>

        <PatientInlineField label="Address:" value={patient.address} />

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">
            Assessment Findings:
          </div>
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
            <InlineField
              label="O₂ Sat:"
              value={patient.o2sat || patient.o2Sat}
            />
            <InlineField label="GCS:" value={patient.gcs} />
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">
            General Status:
          </div>
          <div className="grid grid-cols-2 gap-y-1">
            <CheckboxLabel
              checked={patientChecked(patient, "conscious", "generalStatus", "Conscious")}
              label="Conscious"
            />
            <CheckboxLabel
              checked={patientChecked(patient, "unconscious", "generalStatus", "Unconscious")}
              label="Unconscious"
            />
            <CheckboxLabel
              checked={patientChecked(patient, "ambulatory", "mobility", "Ambulatory")}
              label="Ambulatory"
            />
            <CheckboxLabel
              checked={patientChecked(patient, "nonAmbulatory", "mobility", "Non-Ambulatory")}
              label="Non-Ambulatory"
            />
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] font-semibold">
            If Vehicular Accident:
          </div>
          <div className="grid grid-cols-2 gap-y-1">
            <CheckboxLabel
              checked={patientChecked(patient, "driver", "vehicularRole", "Driver")}
              label="Driver"
            />
            <CheckboxLabel
              checked={patientChecked(patient, "passenger", "vehicularRole", "Passenger")}
              label="Passenger"
            />
            <CheckboxLabel
              checked={patientChecked(patient, "pedestrian", "vehicularRole", "Pedestrian")}
              label="Pedestrian"
            />
          </div>
          <div className="mt-1 space-y-0.5">
            <LineValueLabel label="Helmet (+/-)" value={plusMinusNa(patient.helmet)} />
            <LineValueLabel label="Alcohol Breath (+/-)" value={plusMinusNa(patient.alcoholBreath)} />
            <LineValueLabel label="Driver's License (+/-)" value={plusMinusNa(patient.driversLicense)} />
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
            <InlineField label="P:" value={patient.pa || patient.p2} />
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
          <div className="mt-1 grid grid-cols-2 gap-1">
            <InlineField label="IE:" value={patient.ie} />
            <InlineField label="BOW: (+ / -)" value={patient.bow} />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto bg-black/70 p-3 md:p-5"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => setSelected(null)}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card p-4 print:hidden">
          <div>
            <h2 className="font-bold">
              {selected.responseNumber || "Dispatch Form Preview"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selected.status || "Draft"} ·{" "}
              {selected.placeOfIncident || "No location entered"}
            </p>
          </div>

          <button
            onClick={() => setSelected(null)}
            aria-label="Close dispatch preview"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground hover:bg-secondary/80"
          >
            <X size={18} />
          </button>
        </div>

        {/* Document Body */}
        <div className="overflow-auto bg-muted/20 p-4">
          {linkedPcr && (
            <div className="mx-auto mb-3 grid w-full max-w-275 gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-xs text-foreground md:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Linked PCR</span>
                <div className="font-semibold text-green-400">
                  {linkedPcr.responseNumber || linkedPcr.id}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Patient</span>
                <div className="font-semibold">
                  {linkedPcr.patientName || patient1.name || "Unnamed patient"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="font-semibold">
                  {linkedPcr.localStatus || linkedPcr.status || "Submitted"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Hospital</span>
                <div className="font-semibold">
                  {linkedPcr.hospitalName ||
                    linkedPcr.endorsementHospital ||
                    "Not entered"}
                </div>
              </div>
            </div>
          )}
          <div
            ref={paperRef}
            className="dispatch-official-form mx-auto bg-white text-black shadow"
          >
            <style>{`.dispatch-official-form{width:215.9mm;min-width:215.9mm;height:330.2mm;padding:12.7mm;font-family:Tahoma,Arial,sans-serif;font-size:10pt;line-height:1;overflow:hidden}.dispatch-official-form *{font-family:Tahoma,Arial,sans-serif;font-size:10pt!important;line-height:1!important}.dispatch-official-form .dispatch-doc-header{position:relative;height:31mm;padding:0!important}.dispatch-official-form .dispatch-title-block{width:88mm;margin:0 auto;overflow:visible}.dispatch-official-form .dispatch-country{font-size:12pt!important;font-weight:400}.dispatch-official-form .dispatch-form-municipality{font-size:12pt!important;white-space:nowrap}.dispatch-official-form .dispatch-form-service{font-family:"Harlow Solid Italic","Harlow Solid","Brush Script MT",cursive!important;font-size:14pt!important;font-style:italic;font-weight:400;white-space:nowrap}.dispatch-official-form .dispatch-form-title{font-size:12pt!important}.dispatch-official-form .dispatch-section-title{font-weight:700}.dispatch-official-form .dispatch-section-caller{font-size:8pt!important}.dispatch-official-form .dispatch-section-nature{font-size:9pt!important}.dispatch-official-form .dispatch-section-patients{font-size:12pt!important}.dispatch-official-form .dispatch-nature-panel,.dispatch-official-form .dispatch-nature-panel *{font-size:9pt!important}.dispatch-official-form .dispatch-fine-print,.dispatch-official-form .dispatch-fine-print *{font-size:7pt!important}.dispatch-official-form .dispatch-field{min-height:6mm}.dispatch-official-form .dispatch-field>div:first-child{font-weight:700}.dispatch-official-form .dispatch-patient-block,.dispatch-official-form .dispatch-patient-block *{font-size:9pt!important}.dispatch-official-form .dispatch-patient-title{font-size:10pt!important}.dispatch-official-form .dispatch-inline-field{display:grid!important;grid-template-columns:auto minmax(0,1fr);column-gap:.7mm;min-width:0}.dispatch-official-form .dispatch-inline-field>span:first-child{white-space:nowrap}.dispatch-official-form .dispatch-inline-field>span:last-child{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:clip}.dispatch-official-form .dispatch-choice-label,.dispatch-official-form .dispatch-choice-label *{font-size:8pt!important;white-space:nowrap}.dispatch-official-form .dispatch-choice-label>span:first-child{width:3.2mm!important;height:3.2mm!important;min-width:3.2mm}.dispatch-official-form .dispatch-header-logo{position:absolute;display:block;width:auto;object-fit:contain}.dispatch-official-form .dispatch-logo-bagong{left:10.76mm;top:0;height:21.35mm;width:22.84mm}.dispatch-official-form .dispatch-logo-seal{left:31.59mm;top:3.1mm;height:20.81mm;width:20.81mm}.dispatch-official-form .dispatch-logo-rescue{left:143.09mm;top:0;height:24.47mm;width:24.47mm}.dispatch-official-form .p-2{padding:.65mm!important}.dispatch-official-form .p-1{padding:.35mm!important}.dispatch-official-form .py-1{padding-top:.4mm!important;padding-bottom:.4mm!important}.dispatch-official-form .px-4{padding-left:0!important;padding-right:0!important}.dispatch-official-form .py-3{padding-top:0!important;padding-bottom:0!important}.dispatch-official-form .min-h-18{min-height:11mm!important}@media(max-width:900px){.dispatch-official-form{transform-origin:top left}}`}</style>
            <style>{`.dispatch-official-form,.dispatch-official-form *{box-sizing:border-box!important;line-height:1.35!important}.dispatch-official-form *{font-size:9pt!important}.dispatch-official-form .dispatch-field{min-height:12mm!important;border-top:0!important;border-bottom:0!important}.dispatch-official-form .dispatch-field>div:first-child{height:5.5mm!important;min-height:5.5mm!important;padding:1.1mm 1.2mm!important;display:flex;align-items:center;line-height:1!important}.dispatch-official-form .dispatch-field>div:last-child{height:6.5mm!important;min-height:6.5mm!important;padding:1.1mm 1.2mm!important;display:flex;align-items:center;line-height:1.15!important}.dispatch-official-form .grid.grid-cols-12.border-b>div{min-height:7mm;padding:1.25mm!important;display:flex;align-items:center}.dispatch-official-form .dispatch-section-title{min-height:6mm!important;padding:1.2mm!important;display:flex;align-items:center;justify-content:center;line-height:1!important}.dispatch-official-form .p-1{padding:1.1mm!important}.dispatch-official-form .py-1{padding-top:1.2mm!important;padding-bottom:1.2mm!important}.dispatch-official-form .dispatch-choice-label>span:first-child{border-radius:0!important}.dispatch-official-form .dispatch-country{font-size:12pt!important}.dispatch-official-form .dispatch-form-municipality{font-size:12pt!important}.dispatch-official-form .dispatch-form-service{font-size:14pt!important}.dispatch-official-form .dispatch-form-title{font-size:12pt!important}.dispatch-official-form .dispatch-section-caller{font-size:8pt!important}.dispatch-official-form .dispatch-section-nature{font-size:9pt!important}.dispatch-official-form .dispatch-section-patients{font-size:12pt!important}.dispatch-official-form .dispatch-fine-print,.dispatch-official-form .dispatch-fine-print *{font-size:7pt!important}.dispatch-official-form .dispatch-patient-block .dispatch-inline-field{min-height:5mm!important;align-items:center}.dispatch-official-form .dispatch-patient-block .dispatch-choice-label{min-height:4.5mm!important;align-items:center}.dispatch-official-form .dispatch-patient-block .space-y-0\\.5>div{margin-top:1mm!important;margin-bottom:1mm!important}.dispatch-official-form.dispatch-export-capture{transform:none!important}`}</style>
            <style>{`.dispatch-official-form .dispatch-paper-content{width:106.383%;transform:scale(.94);transform-origin:top left}.dispatch-official-form .dispatch-patient-block .dispatch-inline-field{min-height:3.3mm!important;align-items:center}.dispatch-official-form .dispatch-patient-block .dispatch-choice-label{min-height:3.4mm!important;align-items:center}.dispatch-official-form .dispatch-patient-block .space-y-0\\.5>div{margin-top:.25mm!important;margin-bottom:.25mm!important}.dispatch-official-form .dispatch-patient-block .min-h-18{min-height:10mm!important}.dispatch-official-form .dispatch-patient-block,.dispatch-official-form .dispatch-patient-block *{line-height:1.05!important}.dispatch-official-form .dispatch-patient-block>div:last-child{padding:.65mm!important}`}</style>
            <style>{`.dispatch-official-form .dispatch-patient-inline-field{min-height:4mm!important;align-items:flex-end}.dispatch-official-form .dispatch-patient-inline-field>span:first-child{white-space:nowrap}.dispatch-official-form .dispatch-patient-inline-field>span:last-child{display:block;white-space:normal;overflow-wrap:anywhere;word-break:normal;font-size:8.2pt!important;line-height:1.05!important}`}</style>
            {/* Paper */}
            <div className="dispatch-paper-content border border-black">
              {/* Header */}
              <div className="dispatch-doc-header border-b border-black">
                <img
                  src={bagongPilipinasAsset}
                  alt="Bagong Pilipinas"
                  className="dispatch-header-logo dispatch-logo-bagong"
                />
                <img
                  src={municipalSealAsset}
                  alt="Municipality of Echague seal"
                  className="dispatch-header-logo dispatch-logo-seal"
                />
                <div className="dispatch-title-block absolute inset-x-0 top-0 text-center">
                  <div className="dispatch-country leading-tight">
                    Republic of the Philippines
                  </div>
                  <div className="dispatch-country leading-tight">
                    Province of Isabela
                  </div>
                  <div className="dispatch-form-municipality font-bold uppercase leading-tight">
                    Municipality of Echague
                  </div>
                  <div className="dispatch-form-service mt-1 font-serif italic leading-tight">
                    Echague Rescue Emergency Medical Service
                  </div>
                  <div className="dispatch-form-title font-bold uppercase">
                    Dispatch Form
                  </div>
                </div>
                <img
                  src={rescueLogoAsset}
                  alt="Echague Rescue logo"
                  className="dispatch-header-logo dispatch-logo-rescue"
                />
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
                <PreviewField
                  label="Group Leader"
                  value={selected.groupLeader}
                />
                <PreviewField
                  label="Assistant Aider"
                  value={selected.assistantAider}
                />
              </div>

              {/* Caller Data */}
              <div className="border-b border-black">
                <div className="dispatch-section-title dispatch-section-caller border-b border-black py-1 text-center font-bold uppercase">
                  Caller Data
                </div>
                <div className="grid grid-cols-3">
                  <PreviewField label="Name" value={selected.callerName} />
                  <PreviewField
                    label="Address"
                    value={selected.callerAddress}
                  />
                  <PreviewField
                    label="Contact Number"
                    value={selected.callerContact}
                  />
                </div>
              </div>

              {/* Nature of Call */}
              <div className="border-b border-black">
                <div className="dispatch-section-title dispatch-section-nature border-b border-black py-1 text-center font-bold uppercase">
                  Nature of Call
                </div>

                <div className="grid grid-cols-12">
                  {/* Left side */}
                  <div className="dispatch-nature-panel col-span-8 border-r border-black p-2">
                    <div className="grid grid-cols-2 gap-y-1">
                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Conduction",
                          "conduction",
                        )}
                        label="Conduction"
                      />
                      <CheckboxLabel
                        checked={hasNature(selected, "Transport", "transport")}
                        label="Transport"
                      />

                      <CheckboxLabel
                        checked={hasNature(selected, "Medical", "medical")}
                        label="Medical"
                      />
                      <CheckboxLabel
                        checked={hasNature(selected, "Pediatric", "pediatric")}
                        label="Pediatric"
                      />

                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Psychiatric",
                          "psychiatric",
                        )}
                        label="Psychiatric"
                      />
                      <CheckboxLabel
                        checked={hasNature(selected, "Surgical", "surgical")}
                        label="Surgical"
                      />

                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Obstetrical",
                          "obstetrical",
                        )}
                        label="Obstetrical"
                      />
                      <CheckboxLabel
                        checked={hasNature(selected, "Drowning", "drowning")}
                        label="Drowning"
                      />

                      <CheckboxLabel
                        checked={hasNature(selected, "Trauma", "trauma")}
                        label="Trauma"
                      />
                      <CheckboxLabel
                        checked={hasNature(selected, "Fall", "fall")}
                        label="Fall"
                      />

                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Electrocution",
                          "electrocution",
                        )}
                        label="Electrocution"
                      />
                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Domestic Violence",
                          "domesticViolence",
                        )}
                        label="Domestic Violence"
                      />

                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Water Rescue Incident",
                          "waterRescueIncident",
                        )}
                        label="Water Rescue Incident"
                      />
                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Fire Incident",
                          "fireIncident",
                        )}
                        label="Fire Incident"
                      />

                      <CheckboxLabel
                        checked={hasNature(selected, "Assault", "assault")}
                        label="Assault"
                      />
                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Animal Bite",
                          "animalBite",
                        )}
                        label="Animal Bite"
                      />

                      <CheckboxLabel
                        checked={hasNature(
                          selected,
                          "Motor Vehicle Crash",
                          "motorVehicleCrash",
                        )}
                        label="Motor Vehicle Crash"
                      />
                    </div>

                    <div className="mt-2 border-t border-black pt-2">
                      <div className="text-[11px] font-semibold">
                        Other / Selected Incident Types:
                      </div>
                      <div className="min-h-8 whitespace-pre-wrap text-[11px]">
                        {incidentTypes}
                      </div>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="dispatch-fine-print col-span-4 p-2">
                    <div className="space-y-2">
                      <div>
                        <div className="mb-1 font-semibold">Nature:</div>
                        <div className="flex gap-4">
                          <CheckboxLabel
                            checked={
                              (selected.injuryNature ||
                                selected.incidentNature) === "Self-Inflicted"
                            }
                            label="Self-Inflicted"
                          />
                          <CheckboxLabel
                            checked={
                              (selected.injuryNature ||
                                selected.incidentNature) === "Accidental"
                            }
                            label="Accidental"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold">If ingestion:</div>
                        <div className="min-h-7 border-b border-black px-1 py-1">
                          {selected.ingestionDetails ||
                            selected.ifIngestion ||
                            selected.ingestionItem ||
                            ""}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold">Quantity:</div>
                        <div className="min-h-6 border-b border-black px-1 py-1">
                          {selected.ingestionQuantity ||
                            selected.quantity ||
                            ""}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold">If Fall:</div>
                        <div className="min-h-6 border-b border-black px-1 py-1">
                          {selected.fallDetails || selected.ifFall || ""}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Accident row */}
              <div className="grid grid-cols-12 border-b border-black text-[11px]">
                <div className="col-span-2 border-r border-black p-1">
                  <CheckboxLabel
                    checked={selected.selfAccident}
                    label="Self-Accident"
                  />
                </div>
                <div className="col-span-2 border-r border-black p-1">
                  <CheckboxLabel
                    checked={selected.collision}
                    label="Collision"
                  />
                </div>
                <div className="col-span-8 p-1">
                  <span className="font-bold">Vehicle involve:</span>{" "}
                  {selected.vehicleInvolve || selected.vehicleInvolved || ""}
                </div>
              </div>

              {/* Incident details */}
              <div className="border-b border-black">
                <IncidentRowField
                  label="Place of Incident"
                  value={selected.placeOfIncident}
                />
                <IncidentRowField
                  label="Time of Incident"
                  value={selected.timeOfIncident}
                />
                <IncidentRowField
                  label="Date of Incident"
                  value={formatLongDate(selected.dateOfIncident, "")}
                />
              </div>

              {/* Assistance needed */}
              <div className="border-b border-black p-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-bold uppercase">Assistance Needed</span>
                  <CheckboxLabel
                    checked={hasAssistance(selected, "PNP", "assistancePNP")}
                    label="PNP"
                  />
                  <CheckboxLabel
                    checked={hasAssistance(selected, "BFP", "assistanceBFP")}
                    label="BFP"
                  />
                  <CheckboxLabel
                    checked={hasAssistance(
                      selected,
                      "BRGY. OFFICIALS",
                      "assistanceBrgyOfficials",
                    )}
                    label="Brgy. Officials"
                  />
                  <CheckboxLabel
                    checked={hasAssistance(
                      selected,
                      "OTHERS",
                      "assistanceOthers",
                    )}
                    label="Others"
                  />
                  <span className="min-w-35 border-b border-black px-1">
                    {selected.assistanceOthersText ||
                      selected.assistanceOther ||
                      ""}
                  </span>
                </div>
              </div>

              {/* Dispatch Times */}
              <div className="border-b border-black">
                <div className="grid grid-cols-6 text-[11px]">
                  <PreviewField
                    label="Dispatched Time"
                    value={selected.dispatchedTime}
                  />
                  <PreviewField
                    label="Arrival at the Scene"
                    value={selected.arrivalAtScene || selected.arrivalScene}
                  />
                  <PreviewField
                    label="Departure at the Scene"
                    value={selected.departureAtScene || selected.departureScene}
                  />
                  <PreviewField
                    label="Arrival at the Hospital"
                    value={
                      selected.arrivalAtHospital || selected.arrivalHospital
                    }
                  />
                  <PreviewField
                    label="Departure at the Hospital"
                    value={
                      selected.departureAtHospital || selected.departureHospital
                    }
                  />
                  <PreviewField
                    label="Arrival at the Office"
                    value={
                      selected.arrivalAtOffice ||
                      selected.arrivalOffice ||
                      selected.backToBase
                    }
                  />
                </div>
              </div>

              {/* Hospital */}
              <div className="border-b border-black p-2 text-[11px]">
                <span className="font-bold">Name of Hospital:</span>{" "}
                {selected.hospitalName || selected.nameOfHospital || ""}
              </div>

              {/* Patients */}
              <div>
                <div className="dispatch-section-title dispatch-section-patients border-b border-black py-1 text-center font-bold uppercase">
                  Patient/s Data
                </div>

                <div className="dispatch-patient-grid grid grid-cols-3">
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
                  {formatLongDate(selected.dispatchDate || selected.date, "")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 z-30 flex flex-wrap justify-end gap-2 border-t border-border bg-card p-4 print:hidden">
          <button
            onClick={downloadPdf}
            disabled={exporting}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:cursor-wait disabled:opacity-60"
          >
            <Download size={14} />
            {exporting ? "Creating PDF..." : "Download PDF"}
          </button>
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
            typeof send === "function" &&
            selected.status !== "Sent to Responding Team" &&
            !isPcrCompleted(selected) &&
            !linkedPcr && (
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
    </div>,
    document.body,
  );
}
