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

export function classify(text) {
  return classifyIncident(text).type;
}

export function incidentTypeLabel(key) {
  return key ? key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
}
