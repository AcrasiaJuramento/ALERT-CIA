const AIRWAY_OPTIONS=["Open Airway","Closed Airway","NT/OPA","Jaw Thrust","Suction","Finger Sweep","Abdominal Thrust"];
const BREATHING_OPTIONS=["Positive","Negative","O2 Not Required","O2 Given","Nasal Cannula","Simple Mask","Non-Rebreather Mask","Others"];
const PULSE_OPTIONS=["Positive","Negative","Strong","Weak"];
const PUPIL_OPTIONS=["Equal","Dilated","Constricted","No Reaction"];
const SKIN_OPTIONS=["Warm","Cold","Dry","Moist","Pale","Flushed","Jaundiced"];
const PAIN_QUALITY_OPTIONS=["Crushing","Stabbing","Aching","Gnawing","Burning","Tearing","Cramping"];
const MEDICAL_HISTORY_OPTIONS=["None","Heart Disease","Hypertension","Seizure","COPD","Diabetes Mellitus","Asthma","Stroke"];
const INTERVENTIONS=["Vital signs monitored and recorded","Wound care given","Wound dressing applied","Application of C-Collar","Oxygen inhalation","CPR / compression / rescue breathing / AED","Suctioning","Sponge bath","Cold pack / hot pack","Application of wood splint/s","Application of arm sling","Application of traction splint","Application of KED","Elastic / triangular bandage","Loaded on a spine board","Placed in recovery position","Endorsement to relative / PNP","Conveyance and endorsement to HOC","Others"];
const BODY_MAP_WIDTH=670,BODY_MAP_HEIGHT=621,LEGACY_BODY_MAP_WIDTH=600,LEGACY_BODY_MAP_HEIGHT=330;
const clampBodyValue=value=>Math.max(0,Math.min(1,value));
function normalizeBowValue(value){const original=String(value??"").trim();if(!original)return"";const normalized=original.toLowerCase();if(["positive","+","yes","pos"].includes(normalized))return"Positive";if(["negative","-","no","neg"].includes(normalized))return"Negative";return original;}
function normalizedBodyCoordinate(value,axis="x"){const number=Number(value);if(!Number.isFinite(number))return 0;if(number>=0&&number<=1)return number;return clampBodyValue(number/(axis==="y"?LEGACY_BODY_MAP_HEIGHT:LEGACY_BODY_MAP_WIDTH));}
function canonicalBodyCoordinate(value,axis="x"){return normalizedBodyCoordinate(value,axis)*(axis==="y"?BODY_MAP_HEIGHT:BODY_MAP_WIDTH);}
function normalizedBodySize(mark={}){const normalized=Number(mark.sizeNormalized);if(Number.isFinite(normalized)&&normalized>0)return Math.min(1,normalized);const legacySize=Number(mark.size);return Number.isFinite(legacySize)&&legacySize>0?Math.min(1,legacySize/LEGACY_BODY_MAP_WIDTH):0.09;}

const DEFAULT_ASSETS = {
  body: "",
  painScale: "",
  medicalStar: "",
  bagongPilipinas: "",
  municipalSeal: "",
  rescueLogo: "",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

export function checked(condition) {
  return condition ? "☑" : "☐";
}

const asArray = (value) => (Array.isArray(value) ? value : []);

const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const comparableChoice = value => String(value ?? '').trim().toLowerCase();

const isOn = (selected, option) => {
  const expected = comparableChoice(option);
  return Array.isArray(selected)
    ? selected.some(value => comparableChoice(value) === expected)
    : comparableChoice(selected) === expected;
};

const mark = (selected, option) =>
  `${checked(isOn(selected, option))}${escapeHtml(option)}`;

const rowValue = (value) => escapeHtml(value ?? "");

function safeImageDataUri(value) {
  const uri = String(value || "");

  return /^data:image\/(png|jpe?g|webp|svg\+xml)(;charset=[^;,]+)?(;base64|;utf8)?,/i.test(
    uri,
  )
    ? uri
    : "";
}

function optionLine(options, selected) {
  return options
    .map(
      (option) =>
        `<span class="opt">${mark(selected, option)}</span>`,
    )
    .join("");
}

function yn(value) {
  const yes = value === "Yes" || value === true;
  const no = value === "No" || value === "None" || value === false;

  return `
    <span class="opt">${checked(yes)}YES</span>
    <span class="opt">${checked(no)}NO</span>
  `;
}

function cleanColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || ""))
    ? String(value)
    : "#dc2626";
}

function bodyOverlay(marks = []) {
  return asArray(marks)
    .map((markItem, index) => {
      const color = cleanColor(markItem?.color);

      if (
        Array.isArray(markItem?.points) &&
        markItem.points.length
      ) {
        const points = markItem.points
          .map(
            (point) =>
              `${canonicalBodyCoordinate(point.x, "x").toFixed(1)},${canonicalBodyCoordinate(point.y, "y").toFixed(1)}`,
          )
          .join(" ");

        return `
          <polyline
            points="${points}"
            fill="none"
            stroke="${color}"
            stroke-width="${
              markItem.type === "eraser" ? 12 : 5
            }"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        `;
      }

      const x = canonicalBodyCoordinate(
        markItem?.x ?? markItem?.x2,
        "x",
      );
      const y = canonicalBodyCoordinate(
        markItem?.y ?? markItem?.y2,
        "y",
      );
      const x1 = canonicalBodyCoordinate(
        markItem?.fromX ?? markItem?.x1,
        "x",
      );
      const y1 = canonicalBodyCoordinate(
        markItem?.fromY ?? markItem?.y1,
        "y",
      );

      const tool = String(
        markItem?.tool || markItem?.type || "",
      ).toLowerCase();

      if (tool === "arrow") {
        return `
          <defs>
            <marker
              id="arr${index}"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path
                d="M0,0 L8,4 L0,8z"
                fill="${color}"
              />
            </marker>
          </defs>

          <line
            x1="${x1}"
            y1="${y1}"
            x2="${x}"
            y2="${y}"
            stroke="${color}"
            stroke-width="5"
            marker-end="url(#arr${index})"
          />
        `;
      }

      if (tool === "pen") {
        return `
          <line
            x1="${x1}"
            y1="${y1}"
            x2="${x}"
            y2="${y}"
            stroke="${color}"
            stroke-width="5"
            stroke-linecap="round"
          />
        `;
      }

      if (tool === "circle") {
        const radius = Math.max(
          8,
          (normalizedBodySize(markItem) * BODY_MAP_WIDTH) / 2,
        );

        return `
          <circle
            cx="${x}"
            cy="${y}"
            r="${radius}"
            fill="none"
            stroke="${color}"
            stroke-width="5"
          />
        `;
      }

      if (tool === "text") {
        return `
          <text
            x="${x}"
            y="${y}"
            fill="${color}"
            font-size="18"
            font-weight="700"
            dominant-baseline="hanging"
          >
            ${escapeHtml(
              markItem?.label ||
                markItem?.text ||
                "Injury",
            )}
          </text>
        `;
      }

      return `
        <circle
          cx="${x}"
          cy="${y}"
          r="8"
          fill="${color}"
          stroke="#fff"
          stroke-width="2"
        />
      `;
    })
    .join("");
}

function bodyMap(record, bodyImageDataUri, assets) {
  const body = asObject(record.bodyMap);
  const savedImage = safeImageDataUri(body.image);

  const baseImage =
    savedImage ||
    safeImageDataUri(bodyImageDataUri) ||
    assets.body;

  return `
    <div class="body-map">
      <div class="body-map-frame">
      ${
        baseImage
          ? `<img src="${escapeHtml(
              baseImage,
            )}" alt="Body map" />`
          : `<div class="body-placeholder">
              FRONT / BACK BODY MAP
            </div>`
      }

      ${
        savedImage
          ? ""
          : `
            <svg
              viewBox="0 0 ${BODY_MAP_WIDTH} ${BODY_MAP_HEIGHT}"
              preserveAspectRatio="xMidYMid meet"
            >
              ${bodyOverlay(body.marks)}
            </svg>
          `
      }
      </div>
    </div>
  `;
}

function signatureDetails(record, key, nameOverride = "") {
  const signatures = asObject(record.signatures);
  const names = asObject(record.signatureNames);
  const dates = asObject(record.signatureDates);

  return {
    image: safeImageDataUri(signatures[key]),
    name: nameOverride || names[key] || "",
    date: dates[key] || "",
  };
}

function signatureMark(record, title, key, nameOverride = "") {
  const { image, name } = signatureDetails(record, key, nameOverride);

  return `
    <div class="sig-space">
      ${
        image
          ? `<img
              src="${escapeHtml(image)}"
              alt="${escapeHtml(title)} signature"
            />`
          : ""
      }
    </div>

    <div class="sig-name">${escapeHtml(name)}</div>
  `;
}

function signature(record, title, key) {
  const { date } = signatureDetails(record, key);

  return `
    <td class="signature">
      <div class="signature-role">${escapeHtml(title)}</div>
      ${signatureMark(record, title, key)}
      <div class="signature-caption">Signature over printed name</div>
      <div class="signature-date">
        Date &amp; Time:
        ${escapeHtml(date)}
      </div>
    </td>
  `;
}

export function buildPCRHtml(
  record = {},
  bodyImageDataUri = "",
  customAssets = {},
) {
  const assets = {
    ...DEFAULT_ASSETS,
    ...asObject(customAssets),
  };

  const timeline = {
    ...record,
    ...asObject(record.timeline),
  };

  const obstetric = asObject(record.obstetric);
  const bow = normalizeBowValue(obstetric.bow);
  const crash = asObject(record.crash);
  const allergies = asObject(record.allergies);
  const hospitalization = asObject(
    record.hospitalization,
  );
  const smoking = asObject(record.smoking);
  const alcohol = asObject(record.alcohol);
  const interventions = asObject(record.interventions);
  const interventionDetails = asObject(
    record.interventionDetails,
  );

  const originalVitals = asArray(record.vitals);

  const vitals = [
    ...originalVitals.slice(0, 3),
    ...Array.from(
      {
        length: Math.max(
          0,
          3 - originalVitals.length,
        ),
      },
      () => ({}),
    ),
  ];

  const originalMedications = asArray(
    record.medications,
  );

  const medications = [
    ...originalMedications.slice(0, 4),
    ...Array.from(
      {
        length: Math.max(
          0,
          4 - originalMedications.length,
        ),
      },
      () => ({}),
    ),
  ];

  const additionalVitals = originalVitals.slice(3);
  const additionalMedications = originalMedications.slice(4);
  const gcsAssessments = recordedGcsRows(record);

  // Use the latest recorded assessment.
  // Change to [0] if the first assessment should be used instead.
  const currentGcs =
    gcsAssessments[gcsAssessments.length - 1] || {};

  const currentGcsTotal = gcsTotal(currentGcs);

  // The official GCS area shows the latest score. When more than one
  // assessment exists, the continuation page preserves the complete series.
  const additionalGcs = gcsAssessments.length > 1 ? gcsAssessments : [];
  const score = painScore(record);

  const continuationSections = [
    continuationTable(
      "Additional vital-sign assessments",
      ["#", "Time", "Blood pressure", "Pulse", "Respiratory", "Temperature", "Oxygen saturation"],
      additionalVitals.map(
        (vital, index) => `
          <tr>
            <td>${index + 4}</td>
            <td>${rowValue(vital.time)}</td>
            <td>${rowValue(vital.bp)}</td>
            <td>${rowValue(vital.pulse)}</td>
            <td>${rowValue(vital.respiratory)}</td>
            <td>${rowValue(vital.temperature)}</td>
            <td>${rowValue(vital.oxygen)}</td>
          </tr>`,
      ),
    ),
    continuationTable(
      "Recorded Glasgow Coma Scale assessments",
      ["#", "Time", "Eye", "Verbal", "Motor", "Total"],
      additionalGcs.map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${rowValue(row.time)}</td>
            <td>${rowValue(row.eye)}</td>
            <td>${rowValue(row.verbal)}</td>
            <td>${rowValue(row.motor)}</td>
            <td>${rowValue(gcsTotal(row))}</td>
          </tr>`,
      ),
    ),
    continuationTable(
      "Additional medications",
      ["#", "Drug", "Dose", "Date and time taken"],
      additionalMedications.map(
        (medication, index) => `
          <tr>
            <td>${index + 5}</td>
            <td>${rowValue(medication.drug)}</td>
            <td>${rowValue(medication.dose)}</td>
            <td>${rowValue(medication.dateTime)}</td>
          </tr>`,
      ),
    ),
    String(record.notes || '').trim()
      ? `<h2>Additional notes</h2><div class="continuation-notes">${rowValue(record.notes)}</div>`
      : "",
  ].filter(Boolean);

  const continuationHtml = continuationSections.length
    ? `
      <section class="page continuation-page">
        <div class="continuation-heading">PATIENT CARE REPORT — CONTINUATION</div>
        <div class="continuation-identity">
          Patient: ${rowValue(record.patientName)} &nbsp; | &nbsp;
          Date of incident: ${rowValue(timeline.dateOfIncident)}
        </div>
        ${continuationSections.join("")}
      </section>`
    : "";

  const half = Math.ceil(
    INTERVENTIONS.length / 2,
  );

  const interventionRows = Array.from(
    { length: half },
    (_, index) => {
      const interventionCell = (name) => {
        if (!name) {
          return `
            <td></td>
            <td></td>
            <td></td>
          `;
        }

        return `
          <td>
            ${escapeHtml(name)}

            ${
              interventionDetails[name]
                ? `
                  <small>
                    ${escapeHtml(
                      interventionDetails[name],
                    )}
                  </small>
                `
                : ""
            }
          </td>

          <td class="yn">
            ${checked(
              interventions[name] === "Yes",
            )}
          </td>

          <td class="yn">
            ${checked(
              interventions[name] === "No",
            )}
          </td>
        `;
      };

      return `
        <tr>
          ${interventionCell(
            INTERVENTIONS[index],
          )}

          ${interventionCell(
            INTERVENTIONS[index + half],
          )}
        </tr>
      `;
    },
  ).join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes"
  />

  <style>
    @page {
      size: 215.9mm 330.2mm;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
    }

    body {
      font-family: Tahoma, Arial, sans-serif;
      background: #cbd5e1;
      color: #111;
      font-size: 9px;
      line-height: 1.15;
    }

    .page {
      position: relative;
      width: 215.9mm;
      height: 330.2mm;
      margin: 0 auto 5mm;
      background: #fff;
      padding: 7mm;
      overflow: hidden;
      page-break-after: always;
    }

    .page:last-child {
      page-break-after: auto;
    }

    .continuation-page {
      height: auto;
      min-height: 330.2mm;
      overflow: visible;
      font-size: 8px;
    }

    .continuation-heading {
      border: 0.55px solid #111;
      background: #d9d9d9;
      padding: 2mm;
      font-size: 11px;
      font-weight: 800;
      text-align: center;
    }

    .continuation-identity {
      border: 0.55px solid #111;
      border-top: 0;
      padding: 2mm;
      margin-bottom: 3mm;
    }

    .continuation-page h2 {
      margin: 4mm 0 1mm;
      font-size: 9px;
    }

    .continuation-table {
      table-layout: auto;
    }

    .continuation-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .continuation-notes {
      border: 0.55px solid #111;
      padding: 2mm;
      line-height: 1.4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th,
    td {
      border: 0.55px solid #111;
      padding: 0.65mm;
      line-height: 1.15;
      vertical-align: middle;
      overflow-wrap: anywhere;
    }

    th,
    .shade {
      background: #d9d9d9;
      font-weight: 700;
      text-align: center;
    }

    .tiny {
      font-size: 5.6px;
    }

    .small {
      font-size: 6.2px;
    }

    .center {
      text-align: center;
    }

    .left {
      text-align: left;
    }

    .bold {
      font-weight: 700;
    }

    .opt {
      display: inline-block;
      margin-right: 1.6mm;
      white-space: nowrap;
    }

    .line {
      display: inline-block;
      min-width: 22mm;
      border-bottom: 0.5px solid #111;
      padding: 0 0.6mm;
    }

    .header {
      height: 32mm;
      position: relative;
      text-align: center;
    }

    .header .left-logos {
      position: absolute;
      left: 4mm;
      top: 1mm;
      display: flex;
      align-items: center;
      gap: 2mm;
    }

    .header .left-logos img:first-child {
      width: 20.57mm;
      height: 19.26mm;
      object-fit: contain;
    }

    .header .left-logos img:last-child {
      width: 18.22mm;
      height: 18.22mm;
      object-fit: contain;
    }

    .header .rescue {
      position: absolute;
      right: 10mm;
      top: 0;
      width: 22.69mm;
      height: 22.69mm;
      object-fit: contain;
    }

    .header .gov {
      font-family: Tahoma, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.25;
    }

    .header .service {
      font-family: "Harlow Solid Italic", "Harlow Solid", "Brush Script MT", cursive;
      font-size: 14pt;
      margin-top: 2mm;
    }

    .header .title {
      font-family: Tahoma, Arial, sans-serif;
      font-size: 12pt;
      font-weight: 800;
      letter-spacing: 0.4px;
    }

    .watermark {
      position: absolute;
      z-index: 0;
      opacity: 0.1;
      pointer-events: none;
    }

    .watermark-one {
      width: 80mm;
      left: 59mm;
      top: 94mm;
    }

    .watermark-two {
      width: 72mm;
      left: 63mm;
      top: 86mm;
    }

    .content {
      position: relative;
      z-index: 1;
    }

    .height-5 {
      height: 5.4mm;
    }

    .height-6 {
      height: 6.4mm;
    }

    .height-10 {
      height: 10mm;
    }

    .height-14 {
      height: 14mm;
    }

    .no-padding {
      padding: 0;
    }

    .triage td {
      font-weight: 700;
      text-align: center;
    }

    .triage-red {
      background: #f10d0d;
    }

    .triage-yellow {
      background: #fff400;
    }

    .triage-green {
      background: #8ed15d;
    }

    .triage-black {
      background: #151515;
      color: #fff;
    }

    .emergency td {
      vertical-align: top;
    }

    .body-map {
      height: 62mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .body-map-frame {
      position: relative;
      width: 66.86mm;
      height: 62mm;
    }

    .body-map img {
      width: 100%;
      height: 100%;
      object-fit: fill;
    }

    .body-map svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .body-placeholder {
      height: 100%;
      display: grid;
      place-items: center;
      color: #777;
      border: 1px dashed #777;
      font-weight: 700;
    }

    .chief {
      height: 41mm;
      vertical-align: top;
    }

    .chief-lines {
      margin-top: 1.5mm;
      line-height: 4.2mm;
      white-space: pre-wrap;
    }

    .vitals th,
    .vitals td {
      text-align: center;
    }

    .gcs {
      font-size: 5.6px;
    }

    .gcs th,
    .gcs td {
      text-align: center;
      padding: 0.35mm;
    }

    .page-two {
      font-size: 6.6px;
    }

    .pain-image {
      width: 88mm;
      height: 21mm;
      object-fit: contain;
    }

    .pain-scale-wrap {
      position: relative;
      display: inline-block;
      max-width: 88mm;
    }

    .pain-score-marker {
      position: absolute;
      top: -1mm;
      transform: translateX(-50%);
      color: #b91c1c;
      font-size: 11px;
      line-height: 1;
    }

    .pain-score-value {
      margin-top: 0.5mm;
      font-size: 6.3px;
    }

    .interventions {
      font-size: 6.3px;
    }

    .interventions td {
      height: 5.2mm;
    }

    .interventions .yn {
      width: 5.5%;
      text-align: center;
    }

    .interventions small {
      display: block;
      font-size: 5px;
    }

    .signature {
      height: 29mm;
      text-align: center;
      vertical-align: top;
    }

    .signature-role {
      font-weight: 700;
    }

    .sig-space {
      height: 16mm;
      border-bottom: 0.5px solid #111;
      margin: 1mm 2mm;
    }

    .sig-space img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .sig-name {
      font-weight: 700;
      min-height: 3.5mm;
      line-height: 2.6mm;
      font-size: 5.5px;
      overflow-wrap: anywhere;
    }

    .signature-caption {
      font-size: 5.5px;
      line-height: 2.6mm;
    }

    .signature-date {
      font-size: 5.7px;
      line-height: 2.8mm;
    }

    .compact-signature {
      text-align: center;
      vertical-align: top;
      padding: 0.4mm 0.8mm;
    }

    .compact-signature .sig-space {
      height: 8mm;
      margin: 0.4mm 1.2mm;
    }

    .compact-signature .sig-name {
      min-height: 2.2mm;
      line-height: 2.2mm;
      font-size: 5px;
    }

    .waiver {
      font-family: "Times New Roman", serif;
      font-size: 9px;
      line-height: 1.45;
      text-align: justify;
      padding: 2mm;
    }

    .medical-star-background {
      position: absolute;
      left: 41mm;
      top: 91mm;
      width: 116mm;
      opacity: 0.14;
    }

    .resident-lines {
      height: 18mm;
      vertical-align: top;
      line-height: 4mm;
      white-space: pre-wrap;
    }

    @media screen {
      body {
        padding: 0;
      }

      .page {
        box-shadow:
          0 3px 14px rgba(15, 23, 42, 0.25);
      }
    }

    @media print {
      body {
        background: #fff;
      }

      .page {
        margin: 0;
        box-shadow: none;
      }
    }
  </style>
</head>

<body>
  <section class="page">
    ${
      assets.medicalStar
        ? `
          <img
            class="watermark watermark-one"
            src="${assets.medicalStar}"
            alt=""
          />
        `
        : ""
    }

    <div class="content">
      <div class="header">
        <div class="left-logos">
          ${
            assets.bagongPilipinas
              ? `<img src="${assets.bagongPilipinas}" alt="Bagong Pilipinas" />`
              : ""
          }

          ${
            assets.municipalSeal
              ? `<img src="${assets.municipalSeal}" alt="Municipal seal" />`
              : ""
          }
        </div>

        ${
          assets.rescueLogo
            ? `
              <img
                class="rescue"
                src="${assets.rescueLogo}"
                alt="Echague Rescue"
              />
            `
            : ""
        }

        <div class="gov">
          Republic of the Philippines<br />
          Province of Isabela<br />
          <b>MUNICIPALITY OF ECHAGUE</b>
        </div>

        <div class="service">
          Echague Rescue Emergency Medical Service
        </div>

        <div class="title">
          PATIENT CARE REPORT
        </div>
      </div>

      <table>
        <tr class="height-5">
          <th style="width: 20%">
            RESPONSE NO.
          </th>

          <td style="width: 20%">
            ${rowValue(record.responseNumber)}
          </td>

          <th style="width: 20%">
            VEHICLE
          </th>

          <td>
            ${rowValue(record.vehicle)}
          </td>
        </tr>

        <tr class="height-5">
          <th>
            RESPONDING TEAM
          </th>

          <td>
            ${rowValue(
              record.respondingTeam || record.team,
            )}
          </td>

          <td colspan="2" class="small">
            Driver:
            ${rowValue(record.driver)}

            &nbsp;&nbsp;

            Main Aider:
            ${rowValue(record.mainAider)}

            &nbsp;&nbsp;

            Group Leader:
            ${rowValue(record.groupLeader)}

            &nbsp;&nbsp;

            Assistant Aider:
            ${rowValue(record.assistantAider)}
          </td>
        </tr>
      </table>

      <table>
        <tr class="height-5">
          <th style="width: 44%">
            PATIENT NAME
          </th>

          <th style="width: 12%">
            AGE
          </th>

          <th style="width: 19%">
            BIRTHDAY
          </th>

          <th style="width: 10%">
            GENDER
          </th>

          <th>
            CIVIL STATUS
          </th>
        </tr>

        <tr class="height-6">
          <td>
            ${rowValue(record.patientName)}
          </td>

          <td class="center">
            ${rowValue(record.age)}
          </td>

          <td class="center">
            ${rowValue(record.birthday)}
          </td>

          <td class="center">
            ${rowValue(record.gender)}
          </td>

          <td class="center">
            ${rowValue(record.civilStatus)}
          </td>
        </tr>
      </table>

      <table>
        <tr class="height-5">
          <th style="width: 44%">
            ADDRESS
          </th>

          <th style="width: 31%">
            CONTACT PERSON
          </th>

          <th>
            CONTACT NUMBER
          </th>
        </tr>

        <tr class="height-6">
          <td>
            ${rowValue(record.address)}
          </td>

          <td>
            ${rowValue(record.contactPerson)}
          </td>

          <td>
            ${rowValue(record.contactNumber)}
          </td>
        </tr>
      </table>

      <table>
        <tr class="height-5">
          <th style="width: 28%">
            NATURE OF CALL
          </th>

          <td class="center">
            ${mark(
              record.natureOfCall,
              "Emergency",
            )}
          </td>

          <td class="center">
            ${mark(
              record.natureOfCall,
              "Conduction",
            )}
          </td>
        </tr>

        <tr class="height-5">
          <th>
            DATE OF INCIDENT
          </th>

          <td>
            ${rowValue(timeline.dateOfIncident)}
          </td>

          <th>
            TIME OF INCIDENT
          </th>

          <td>
            ${rowValue(timeline.timeOfIncident)}
          </td>
        </tr>

        <tr class="height-5">
          <th>
            PLACE OF INCIDENT
          </th>

          <td colspan="2">
            ${rowValue(timeline.placeOfIncident)}
          </td>
        </tr>
      </table>

      <table class="small">
        <tr>
          <th>DISPATCHED TIME</th>
          <th>ARRIVAL AT THE SCENE</th>
          <th>DEPARTURE AT THE SCENE</th>
          <th>ARRIVAL AT THE HOSPITAL</th>
          <th>DEPARTURE AT THE HOSPITAL</th>
          <th>BACK TO BASE</th>
        </tr>

        <tr class="height-6">
          <td>
            ${rowValue(
              timeline.dispatchTime ||
                record.dispatchedTime,
            )}
          </td>

          <td>
            ${rowValue(timeline.arrivalScene)}
          </td>

          <td>
            ${rowValue(timeline.departureScene)}
          </td>

          <td>
            ${rowValue(timeline.arrivalHospital)}
          </td>

          <td>
            ${rowValue(timeline.departureHospital)}
          </td>

          <td>
            ${rowValue(timeline.backToBase)}
          </td>
        </tr>
      </table>

      <table class="triage">
        <tr>
          <th style="width: 13%">
            TRIAGE
          </th>

          <td class="triage-red">
            ${checked(record.triage === "Red")}
            RED
          </td>

          <td class="triage-yellow">
            ${checked(record.triage === "Yellow")}
            YELLOW
          </td>

          <td class="triage-green">
            ${checked(record.triage === "Green")}
            GREEN
          </td>

          <td class="triage-black">
            ${checked(record.triage === "Black")}
            BLACK
          </td>
        </tr>
      </table>

      <table class="emergency">
        <tr>
          <th colspan="2">
            TYPE OF EMERGENCY
          </th>
        </tr>

        <tr>
          <td style="width: 82%" class="small">
            <b>
              ${checked(
                asArray(
                  record.emergencyTypes,
                ).includes("Medical"),
              )}
              MEDICAL
            </b>

            <div>
              ${optionLine(
                [
                  "Pediatric",
                  "Psychiatric",
                  "Surgical",
                  "Obstetrical",
                  "Drowning",
                ],
                record.emergencyTypes,
              )}

              Others:
              ${rowValue(record.emergencyOther)}
            </div>

            <br />

            <b>
              ${checked(
                asArray(
                  record.traumaTypes,
                ).includes("Trauma"),
              )}
              TRAUMA
            </b>

            <div>
              ${optionLine(
                [
                  "Fall",
                  "Electrocution",
                  "Domestic Violence",
                  "Water Rescue Incident",
                  "Fire Incident",
                ],
                record.traumaTypes,
              )}
            </div>

            <div>
              ${checked(
                asArray(
                  record.traumaTypes,
                ).includes("Assault"),
              )}
              ASSAULT

              <span class="tiny">
                Pls. Specify:
              </span>

              ${rowValue(record.assaultDetails)}
            </div>

            <div>
              ${checked(
                asArray(
                  record.traumaTypes,
                ).includes("Animal Bite"),
              )}
              ANIMAL BITE

              <span class="tiny">
                Pls. specify:
              </span>

              ${rowValue(
                record.animalBiteDetails,
              )}
            </div>

            <div>
              ${checked(Boolean(record.traumaOther))}
              Other/s:
              ${rowValue(record.traumaOther)}

              &nbsp;

              <b>
                ${checked(
                  asArray(
                    record.traumaTypes,
                  ).includes(
                    "Motor Vehicle Crash",
                  ),
                )}
                MOTOR VEHICLE CRASH
              </b>
            </div>
          </td>

          <td style="width: 18%" class="small">
            <b>Nature:</b><br />
            ${rowValue(
              record.incidentNature ||
                "Self-Inflicted / Accidental",
            )}

            <br />

            <b>If ingestion:</b><br />
            ${rowValue(record.ingestionItem)}

            <br />

            <b>Quantity:</b><br />
            ${rowValue(record.ingestionQuantity)}

            <br />

            <b>If Fall:</b><br />
            ${rowValue(record.fallDetails)}
          </td>
        </tr>
      </table>

      <table class="small section-pair">
        <tr>
          <td class="no-padding" style="width: 50%">
            <table>
              <tr><th colspan="4">OBSTETRIC DATA</th></tr>
              <tr><th>LMP</th><td>${rowValue(obstetric.lmp)}</td><th>G / P</th><td>${rowValue(obstetric.g)} / ${rowValue(obstetric.p)}</td></tr>
              <tr><th>EDC</th><td>${rowValue(obstetric.edc)}</td><th>BOW</th><td>${mark(bow, "Positive")} ${mark(bow, "Negative")}${bow && !["Positive", "Negative"].includes(bow) ? ` Other: ${rowValue(bow)}` : ""}</td></tr>
              <tr><th>AOG</th><td>${rowValue(obstetric.aog)}</td><th>BABY</th><td>${rowValue(obstetric.baby)}</td></tr>
              <tr><th>IE (cm)</th><td>${rowValue(obstetric.ie)}</td><th>PLACENTA</th><td>${rowValue(obstetric.placenta)}</td></tr>
            </table>
          </td>
          <td class="no-padding" style="width: 50%">
            <table>
              <tr><th colspan="4">MOTOR VEHICLE CRASH DETAILS</th></tr>
              <tr><th>Type</th><td colspan="3">${checked(crash.selfAccident === true || crash.selfAccident === "Yes")} SELF-ACCIDENT &nbsp; ${checked(crash.collision === true || crash.collision === "Yes")} COLLISION</td></tr>
              <tr><th>Vehicle Involved</th><td>${rowValue(crash.vehicle)}</td><th>Role</th><td>${rowValue(crash.role)}</td></tr>
              <tr><th>PLATE #</th><td>${rowValue(crash.plate)}</td><th>Alcohol Breath</th><td>${optionLine(["Positive", "Negative"], crash.alcohol)}</td></tr>
              <tr><th>Helmet</th><td>${optionLine(["Positive", "Negative", "N/A"], crash.helmet)}</td><th>Driver's License</th><td>${optionLine(["Positive", "Negative", "Not Applicable"], crash.license)}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <td
            class="chief"
            style="width: 47%"
          >
            <b>
              CHIEF COMPLAINT/INITIAL ASSESSMENT:
            </b>

            <div class="chief-lines">
              ${rowValue(record.chiefComplaint)}
            </div>
          </td>

          <td
            class="no-padding"
            rowspan="2"
          >
            ${bodyMap(
              record,
              bodyImageDataUri,
              assets,
            )}
          </td>
        </tr>

        <tr>
          <td class="no-padding">
            <table class="vitals">
              <tr>
                <th style="width: 54%">
                  VITAL SIGNS
                </th>

                ${vitals
                  .map(
                    (vital) => `<th>TIME<br />${rowValue(vital.time)}</th>`,
                  )
                  .join("")}
              </tr>

              <tr>
                <th>
                  BLOOD PRESSURE(MMHG)
                </th>

                ${vitals
                  .map(
                    (vital) =>
                      `<td>${rowValue(
                        vital.bp,
                      )}</td>`,
                  )
                  .join("")}
              </tr>

              <tr>
                <th>
                  PULSE RATE(BPM)
                </th>

                ${vitals
                  .map(
                    (vital) =>
                      `<td>${rowValue(
                        vital.pulse,
                      )}</td>`,
                  )
                  .join("")}
              </tr>

              <tr>
                <th>
                  RESPIRATORY RATE(CPM)
                </th>

                ${vitals
                  .map(
                    (vital) =>
                      `<td>${rowValue(
                        vital.respiratory,
                      )}</td>`,
                  )
                  .join("")}
              </tr>

              <tr>
                <th>
                  TEMPERATURE (°C)
                </th>

                ${vitals
                  .map(
                    (vital) =>
                      `<td>${rowValue(
                        vital.temperature,
                      )}</td>`,
                  )
                  .join("")}
              </tr>

              <tr>
                <th>
                  OXYGEN SATURATION (%)
                </th>

                ${vitals
                  .map(
                    (vital) =>
                      `<td>${rowValue(
                        vital.oxygen,
                      )}</td>`,
                  )
                  .join("")}
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table class="gcs">
        <colgroup>
          <col class="gcs-response-col" />
          <col class="gcs-score-col" />
          <col class="gcs-verbal-col" />
          <col class="gcs-score-col" />
          <col class="gcs-motor-col" />
          <col class="gcs-score-col" />
          <col class="gcs-total-col" />
        </colgroup>

        <tr>
          <th colspan="7" class="gcs-title">
            GLASGOW COMA SCALE (GCS)
          </th>
        </tr>

        <tr class="gcs-header-row">
          <th>EYE<br />RESPONSE</th>
          <th>SCORE</th>
          <th>VERBAL RESPONSE</th>
          <th>SCORE</th>
          <th>MOTOR RESPONSE</th>
          <th>SCORE</th>
          <th>TOTAL SCORE</th>
        </tr>

        <tr>
          <td>Spontaneously</td>
          <td>4</td>
          <td>Oriented</td>
          <td>5</td>
          <td>Obeys Command</td>
          <td>6</td>
          <td class="gcs-guide">Best Response = 15</td>
        </tr>

        <tr>
          <td>To Speech</td>
          <td>3</td>
          <td>Confused</td>
          <td>4</td>
          <td>Moves to Localized Pain</td>
          <td>5</td>
          <td class="gcs-guide">Comatose Pt. = 8 or less</td>
        </tr>

        <tr>
          <td>To Pain</td>
          <td>2</td>
          <td>Inappropriate Words</td>
          <td>3</td>
          <td>Flexion Withdrawal Pain</td>
          <td>4</td>
          <td class="gcs-guide">Totally Unresponsive = 3</td>
        </tr>

        <tr>
          <td>No Response</td>
          <td>1</td>
          <td>Incomprehensible Sounds</td>
          <td>2</td>
          <td>Abnormal Flexion (Decorticate)</td>
          <td>3</td>

          <td rowspan="3" class="gcs-recorded-total">
            <div class="gcs-recorded-label">RECORDED TOTAL</div>

            <div class="gcs-recorded-score">
              ${
                currentGcsTotal !== ""
                  ? rowValue(currentGcsTotal)
                  : "—"
              }
            </div>

            <div class="gcs-recorded-breakdown">
              E: ${rowValue(currentGcs.eye || "—")}
              &nbsp;
              V: ${rowValue(currentGcs.verbal || "—")}
              &nbsp;
              M: ${rowValue(currentGcs.motor || "—")}
            </div>

            ${
              currentGcs.time
                ? `
                  <div class="gcs-recorded-time">
                    Time: ${rowValue(currentGcs.time)}
                  </div>
                `
                : ""
            }
          </td>
        </tr>

        <tr>
          <td colspan="2"></td>
          <td>No Response</td>
          <td>1</td>
          <td>Abnormal Extension (Decerebrate)</td>
          <td>2</td>
        </tr>

        <tr>
          <td colspan="2"></td>
          <td colspan="2"></td>
          <td>No Response</td>
          <td>1</td>
        </tr>
      </table>

      <table>
        <tr class="height-6">
          <th
            style="width: 47%"
            class="left"
          >
            CONSENT FOR CARE:
            ${rowValue(record.consentForCare)}
          </th>

          <th class="left">
            ENDORSED TO:
            ${rowValue(record.endorsedTo)}
          </th>
        </tr>
      </table>

      <table>
        <tr>
          <td
            style="width: 46%"
            class="compact-signature"
          >
            ${signatureMark(
              record,
              "Consent for Care",
              "consent",
            )}
          </td>

          <th style="width: 14%">
            RECEIVED BY
          </th>

          <td colspan="2">
            ${rowValue(
              record.receivedBy ||
                record.receiverName,
            )}
          </td>
        </tr>

        <tr>
          <th>
            SIGNATURE OVER PRINTED NAME
          </th>

          <th>HOSPITAL</th>

          <td colspan="2">
            ${rowValue(
              record.endorsementHospital ||
                record.hospitalName,
            )}
          </td>
        </tr>

        <tr>
          <th>
            DATE &amp; TIME
            ${rowValue(
              asObject(record.signatureDates).consent,
            )}
          </th>

          <th>DATE</th>

          <td>
            ${rowValue(record.hospitalDate)}
          </td>

          <th>
            TIME
            ${rowValue(record.endorsementTime)}
          </th>
        </tr>
      </table>

      <table>
        <tr>
          <th class="left">
            ENDORSEMENT OF VALUABLES
            (Vehicles/Valuables):
          </th>

          <th class="left">
            RECEIVED BY:
          </th>
        </tr>

        <tr>
          <td class="height-14">
            ${rowValue(record.valuables)}
          </td>

          <td class="height-14 compact-signature">
            ${signatureMark(
              record,
              "Valuables Recipient",
              "receiver",
              record.valuablesReceivedBy,
            )}
          </td>
        </tr>

        <tr>
          <th>
            SIGNATURE OVER PRINTED NAME
          </th>

          <th>
            CONTACT NUMBER
            ${rowValue(record.valuablesContact)}
          </th>
        </tr>

        <tr>
          <th>
            DATE &amp; TIME
            ${rowValue(
              asObject(record.signatureDates).receiver,
            )}
          </th>

          <td></td>
        </tr>
      </table>
      
    </div>
  </section>

  <section class="page page-two">
    ${
      assets.medicalStar
        ? `
          <img
            class="watermark watermark-two"
            src="${assets.medicalStar}"
            alt=""
          />
        `
        : ""
    }

    <div class="content">
      <table>
        <tr>
          <th style="width: 45%">
            SUSPECTED SPINAL INJURY
          </th>

          <td class="center">
            ${yn(record.suspectedSpinal)}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <th>AIRWAY</th>
          <th>BREATHING</th>
        </tr>

        <tr>
          <td
            style="
              width: 46%;
              vertical-align: top;
            "
          >
            ${optionLine(
              AIRWAY_OPTIONS,
              record.airway,
            )}
          </td>

          <td style="vertical-align: top">
            ${optionLine(
              BREATHING_OPTIONS,
              record.breathing,
            )}

            <br />

            O2 GIVEN AT
            <span class="line">
              ${rowValue(record.oxygenLpm)}
            </span>
            LPM

            <br />

            Thru:
            ${rowValue(record.oxygenVia)}
          </td>
        </tr>

        <tr>
          <th colspan="2">
            CIRCULATION
          </th>
        </tr>

        <tr>
          <td>
            <b>PULSE:</b>

            ${optionLine(
              PULSE_OPTIONS,
              record.pulseFindings,
            )}
          </td>

          <td>
            <b>BLEEDING:</b>
            ${rowValue(record.bleeding)}

            <br />

            Location:
            ${rowValue(record.bleedingLocation)}

            &nbsp;

            Controlled:
            ${rowValue(
              record.bleedingControlled,
            )}
          </td>
        </tr>

        <tr>
          <td>
            <b>CAPILLARY REFILL:</b>
            ${rowValue(record.capillary)}
          </td>

          <td>
            <b>PUPILS:</b>

            ${optionLine(
              PUPIL_OPTIONS,
              record.pupils,
            )}
          </td>
        </tr>

        <tr>
          <td colspan="2">
            <b>SKIN:</b>

            ${optionLine(
              SKIN_OPTIONS,
              record.skin,
            )}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <td
            style="
              width: 46%;
              vertical-align: top;
            "
          >
            <b>PAIN ASSESSMENT:</b>

            ${mark(
              record.painPositive,
              "Positive",
            )}

            ${mark(
              record.painPositive,
              "Negative",
            )}

            <br />

            <div class="pain-scale-wrap">
            ${
              assets.painScale
                ? `
                  <img
                    class="pain-image"
                    src="${assets.painScale}"
                    alt="Pain scale"
                  />
                `
                : `
                  <div class="height-14 center">
                    PAIN SCALE 0–10
                  </div>
                `
            }
            ${
              score
                ? `<div class="pain-score-marker" style="left: ${2 + (Number(score) * 9.6)}%">▼</div>`
                : ""
            }
            </div>
            <div class="pain-score-value">Score: <b>${rowValue(score ? `${score}/10` : "Not recorded")}</b></div>
          </td>

          <td style="vertical-align: top">
            <b>PAIN LOCATIONS:</b>

            ${rowValue(record.painLocation)}

            <br />

            Onset:

            ${mark(
              record.painOnset,
              "Sudden",
            )}

            ${mark(
              record.painOnset,
              "Gradual",
            )}

            <br />

            Quality:

            ${optionLine(
              PAIN_QUALITY_OPTIONS,
              record.painQuality,
            )}

            Others:
            ${rowValue(record.painOther)}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <th>ALLERGIES</th>
          <th>MEDICATIONS</th>
        </tr>

        <tr>
          <td
            style="
              width: 46%;
              vertical-align: top;
            "
          >
            ${mark(
              allergies.status,
              "With Allergies",
            )}

            ${mark(
              allergies.status,
              "No Allergies",
            )}

            <br />

            <b>Food</b>:
            ${rowValue(allergies.food)}

            <br />

            <b>Drug</b>:
            ${rowValue(allergies.drug)}

            <br />

            <b>Others</b>:
            ${rowValue(allergies.other)}
          </td>

          <td style="vertical-align: top">
            ${mark(
              record.medicationStatus,
              "With Medications",
            )}

            ${mark(
              record.medicationStatus,
              "None",
            )}

            <br />

            ${medications
              .map(
                (medication) => `
                  Drug:
                  <span class="line">
                    ${rowValue(
                      medication.drug,
                    )}
                  </span>

                  Dose:
                  <span class="line">
                    ${rowValue(
                      medication.dose,
                    )}
                  </span>

                  Date &amp; Time taken:
                  ${rowValue(
                    medication.dateTime,
                  )}

                  <br />
                `,
              )
              .join("")}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <th>MEDICAL HISTORY</th>
          <th>HOSPITALIZATION HISTORY</th>
        </tr>

        <tr>
          <td style="width: 46%">
            ${optionLine(
              MEDICAL_HISTORY_OPTIONS,
              record.medicalHistory,
            )}

            Others:
            ${rowValue(
              record.medicalHistoryOther,
            )}
          </td>

          <td>
            ${mark(
              hospitalization.status,
              "Yes",
            )}

            ${mark(
              hospitalization.status,
              "None",
            )}

            <br />

            Date of last Confinement:
            ${rowValue(
              hospitalization.date,
            )}

            <br />

            Where:
            ${rowValue(
              hospitalization.where,
            )}

            Due to:
            ${rowValue(
              hospitalization.reason,
            )}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <th style="width: 46%">
            LAST ORAL INTAKE
          </th>

          <th>
            DO YOU SMOKE?
          </th>

          <th>
            DO YOU DRINK ALCOHOL?
          </th>
        </tr>

        <tr>
          <td>
            Specific Food/Beverage:
            ${rowValue(record.oralIntake)}

            <br /><br />

            Date &amp; Time:
            ${rowValue(
              record.oralIntakeDateTime,
            )}
          </td>

          <td>
            ${rowValue(smoking.status)}

            <br />

            No. of stick/day:
            ${rowValue(smoking.sticks)}

            <br />

            Stopped since?
            ${rowValue(smoking.stopped)}
          </td>

          <td>
            ${rowValue(alcohol.status)}

            <br />

            How Often?
            ${rowValue(alcohol.frequency)}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <th style="width: 28%">
            EVENTS PRIOR TO INJURY:
          </th>

          <td class="height-10">
            ${rowValue(record.eventsPrior)}
          </td>
        </tr>
      </table>

      <table class="interventions">
        <tr>
          <th>INTERVENTIONS</th>
          <th>YES</th>
          <th>NO</th>
          <th>INTERVENTIONS</th>
          <th>YES</th>
          <th>NO</th>
        </tr>

        ${interventionRows}
      </table>

      <table>
        <tr>
          <th>
            REASON/S FOR TRANSFER/NOT
            ADMITTING THE PATIENT:
          </th>

          <th>
            NAME OF HOSPITAL/FACILITY:
          </th>
        </tr>

        <tr>
          <td class="height-10">
            ${rowValue(record.transferReason)}
          </td>

          <td>
            ${rowValue(record.hospitalName)}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <td
            class="resident-lines"
            style="width: 48%"
          >
            ${rowValue(record.residentOnDuty)}
          </td>

          <th>
            SIGNATURE OVER PRINTED NAME
            OF RESIDENT ON DUTY
          </th>
        </tr>

        <tr>
          <td></td>

          <td>
            <b>Date</b>
            ${rowValue(record.hospitalDate)}

            &nbsp;&nbsp;&nbsp;

            <b>Time</b>
            ${rowValue(record.endorsementTime)}
          </td>
        </tr>
      </table>

      <table>
        <tr>
          <th>
            WAIVER (PATIENT’S/ VICTIM’S
            REFUSAL OF TREATMENT AND/OR
            TRANSPORT)
          </th>
        </tr>

        <tr>
          <td class="waiver">
            I, the undersigned have been
            advised that the medical
            assistance on my behalf is
            necessary and that refusal of
            said medical assistance and/or
            transportation for further
            treatment may result in death,
            or imperil my health condition.
            Nevertheless, I refuse to accept
            treatment and/or transport and
            assume all risk and consequences
            of my decision and release the
            ECHAGUE RESCUE Emergency
            services crew from any liability
            arising from my refusal.
          </td>
        </tr>
      </table>

      <table>
        <tr>
          ${signature(
            record,
            "Patient",
            "patient",
          )}

          ${signature(
            record,
            "Witness",
            "witness1",
          )}

          ${signature(
            record,
            "Witness",
            "witness2",
          )}
        </tr>
      </table>
    </div>
  </section>
  ${continuationHtml}
</body>
</html>
  `;
}

function hasGcsValue(row) {
  return ["time", "eye", "verbal", "motor"].some(
    (key) => String(row?.[key] ?? "").trim(),
  );
}

function recordedGcsRows(record) {
  const rows = asArray(record.gcsRows).filter(hasGcsValue);
  if (rows.length) return rows;

  const legacy = asObject(record.gcs);
  return hasGcsValue(legacy) ? [legacy] : [];
}

function gcsTotal(row) {
  const rawValues = [row?.eye, row?.verbal, row?.motor];
  const values = rawValues.map(Number);
  return rawValues.every(value => String(value ?? '').trim()) && values.every(Number.isFinite)
    ? values.reduce((total, value) => total + value, 0)
    : "";
}

function painScore(record) {
  const value = record.painScore;
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10
    ? String(Math.round(number))
    : "";
}

function continuationTable(title, headers, rows) {
  if (!rows.length) return "";
  return `
    <h2>${escapeHtml(title)}</h2>
    <table class="continuation-table">
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}
