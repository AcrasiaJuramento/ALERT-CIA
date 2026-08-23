const TYPES = {
  vehicular: ["accident", "aksidente", "disgrasya", "nadisgrasya", "banggaan", "nagbanggaan", "nagkabanggaan", "salpukan", "sumalpok", "sinalpok", "nasalpok", "nabangga", "bumangga", "tumaob", "tumagilid", "tumilapon", "nasagasaan", "sagasaan", "inararo", "nahulog sa bangin", "nawalan ng preno", "collision", "crash", "hit and run", "hit-and-run", "road crash", "vehicular", "vehicle", "motorcycle", "motorsiklo", "truck accident", "bus accident", "car crash", "pedestrian"],
  fire: ["sunog", "fire", "blaze", "nasunog", "nagliyab", "tinupok ng apoy", "nilamon ng apoy"],
  flood: ["baha", "binaha", "pagbaha", "rumagasang tubig", "apaw", "flood", "flash flood", "overflowed"],
  landslide: ["landslide", "pagguho", "gumuho ang lupa", "gumuhong lupa", "mudslide"],
  robbery: ["holdap", "holdaper", "hold-up", "robbery", "nakawan", "ninakaw", "ninakawan", "nilooban", "tinangay", "hablot", "akyat-bahay", "theft", "stolen"],
  shooting: ["shooting", "pamamaril", "binaril", "nabaril", "pinagbabaril", "gunshot"],
  stabbing: ["stabbed", "stabbing", "pananaksak", "sinaksak", "nasaksak"],
  homicide: ["pinaslang", "pinatay", "pagpatay", "murder", "homicide"],
  drowning: ["drowned", "drowning", "nalunod"],
  rescue: ["rescue", "rescued", "sinagip", "iniligtas", "saklolo", "emergency", "missing person", "nawawala"],
};

const VEHICLE_TERMS = [
  "motorcycle", "motorsiklo", "single motorcycle", "tricycle", "kotse", "car", "van", "truck",
  "bus", "jeep", "jeepney", "pickup", "vehicle", "sasakyan", "ambulance", "pedestrian", "tumatawid",
];

const INJURY_TERMS = [
  "injured", "sugatan", "nasugatan", "patay", "nasawi", "namatay", "killed", "dead on arrival",
  "fatality", "fatalities", "ospital", "hospital", "isinugod", "dinala sa pagamutan",
];

const CASUALTY_OR_SEVERITY_TERMS = [
  ...INJURY_TERMS,
  "dead", "died", "dies", "deceased", "binawian ng buhay", "malubha", "kritikal", "critical",
  "serious injured", "seriously injured", "severe injured", "severely injured", "grabeng sugatan",
  "minor injury", "minor injuries", "bahagyang nasugatan", "walang nasugatan", "no injury", "no injuries",
];

const FALSE_POSITIVE_TERMS = [
  "accidentally", "by accident", "no accident", "not an accident", "accident insurance",
  "accident prevention", "road safety seminar", "drill", "simulation", "anniversary",
];

const CONFIDENCE_LEVELS = [
  { level: "high", min: 0.72 },
  { level: "medium", min: 0.45 },
  { level: "low", min: 0.2 },
];

function matchesAny(text, terms) {
  return terms.filter((term) => text.includes(term));
}

function sentenceWindows(text = "") {
  return String(text).replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function proximityScore(text, accidentTerms, vehicleTerms) {
  const windows = sentenceWindows(text);
  if (!accidentTerms.length || !vehicleTerms.length) return 0;
  const related = windows.filter((sentence) => {
    const low = sentence.toLowerCase();
    return accidentTerms.some((term) => low.includes(term)) && vehicleTerms.some((term) => low.includes(term));
  });
  return related.length ? Math.min(1, related.length / 2) : 0;
}

function confidenceLevel(score) {
  return CONFIDENCE_LEVELS.find((item) => score >= item.min)?.level || null;
}

export function classifyIncident(text) {
  const low = String(text || "").toLowerCase();
  let best = null;
  let score = 0;
  let bestTerms = [];
  for (const [type, words] of Object.entries(TYPES)) {
    const matches = matchesAny(low, words);
    if (matches.length > score) { best = type; score = matches.length; bestTerms = matches; }
  }
  const vehicleTerms = matchesAny(low, VEHICLE_TERMS);
  const injuryTerms = matchesAny(low, INJURY_TERMS);
  const falsePositiveTerms = matchesAny(low, FALSE_POSITIVE_TERMS);
  const vehicularTerms = matchesAny(low, TYPES.vehicular);
  const context = proximityScore(low, vehicularTerms, vehicleTerms);

  let normalizedScore = 0;
  if (best === "vehicular") {
    normalizedScore = Math.min(1, (vehicularTerms.length * 0.14) + (vehicleTerms.length * 0.12) + (injuryTerms.length * 0.06) + (context * 0.35));
  } else if (best) {
    normalizedScore = Math.min(0.7, score * 0.16);
  }
  if (falsePositiveTerms.length) normalizedScore = Math.max(0, normalizedScore - 0.35);
  if (best === "vehicular" && !vehicleTerms.length && context === 0) normalizedScore = Math.min(normalizedScore, 0.38);

  const type = best === "vehicular" && normalizedScore >= 0.2 ? "vehicular" : best;
  const confidence = confidenceLevel(normalizedScore);
  const reason = type === "vehicular"
    ? `${vehicleTerms.length ? "vehicle context found" : "weak vehicle context"}; ${context ? "accident and vehicle terms appear together" : "no close accident-vehicle sentence"}`
    : best
      ? `matched ${best} terms`
      : "no incident pattern matched";

  return {
    type,
    confidence,
    score: Number(normalizedScore.toFixed(4)),
    matchedTerms: [...new Set([...bestTerms, ...vehicleTerms, ...injuryTerms])],
    vehicleTerms: [...new Set(vehicleTerms)],
    injuryTerms: [...new Set(injuryTerms)],
    falsePositiveTerms,
    reason,
  };
}

export function resolveNewsReviewConfidence({ classification = {}, location = null, details = {}, text = "" } = {}) {
  const originalConfidence = classification.confidence || null;
  if (classification.type !== "vehicular") return classification;

  const low = String(text || "").toLowerCase();
  const vehicleTerms = classification.vehicleTerms?.length
    ? classification.vehicleTerms
    : matchesAny(low, VEHICLE_TERMS);
  const casualtyTerms = classification.injuryTerms?.length
    ? classification.injuryTerms
    : matchesAny(low, CASUALTY_OR_SEVERITY_TERMS);
  const vehicleTypes = details.vehicleTypes || details.vehicle_types || [];
  const injuredCount = Number(details.injuredCount ?? details.injured_count ?? NaN);
  const fatalityCount = Number(details.fatalityCount ?? details.fatality_count ?? NaN);
  const victimCount = Number(details.victimCount ?? details.victim_count ?? NaN);
  const hasVehicleDetail = Boolean(vehicleTypes.length || vehicleTerms.length);
  const hasCasualtyOrSeverityDetail = Boolean(
    casualtyTerms.length ||
    (Number.isFinite(injuredCount) && injuredCount > 0) ||
    (Number.isFinite(fatalityCount) && fatalityCount > 0) ||
    (Number.isFinite(victimCount) && victimCount > 0)
  );
  const hasBarangayLocation = Boolean(location?.barangay);
  const highRequirements = {
    road_accident_related: classification.type === "vehicular",
    vehicle_detail: hasVehicleDetail,
    casualty_or_severity_detail: hasCasualtyOrSeverityDetail,
    barangay_location: hasBarangayLocation,
  };
  const missing = Object.entries(highRequirements)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);

  let confidence = originalConfidence;
  if (originalConfidence === "high" && missing.length) {
    confidence = "medium";
  }

  const reasonSuffix = missing.length
    ? ` High confidence requires road accident details, vehicle detail, casualty/severity detail, and barangay-level location; missing ${missing.join(", ")}.`
    : " High confidence requirements met: road accident details, vehicle detail, casualty/severity detail, and barangay-level location.";

  return {
    ...classification,
    confidence,
    reviewConfidence: {
      originalConfidence,
      finalConfidence: confidence,
      highRequirements,
      missingHighRequirements: missing,
    },
    reason: `${classification.reason || "vehicular accident detected"}.${reasonSuffix}`,
  };
}

export function classify(text) {
  return classifyIncident(text).type;
}

export function incidentTypeLabel(key) {
  return key ? key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
}
