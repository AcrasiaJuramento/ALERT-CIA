export const ROAD_ACCIDENT_SEARCH_TERMS = Object.freeze(["accidents", "aksidente", "banggan", "salpukan", "crash"]);

export function matchesRoadAccidentSearch(text, terms = ROAD_ACCIDENT_SEARCH_TERMS) {
  const value = String(text || "").toLowerCase().replace(/[-_]/g, " ");
  return terms.some(term => {
    // Search queries retain the requested spelling; recognize common article forms too.
    if (term === "accidents") return /\baccidents?\b/.test(value);
    if (term === "banggan") return /\b(?:nag)?bangg(?:a|aa)n\b/.test(value);
    if (term === "crash") return /\bcrash(?:es|ed|ing)?\b/.test(value);
    return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(value);
  });
}

export function isRoadAccidentReport(text) {
  const roadContext = /\b(?:road|highway|street|kalsada|lansangan|vehicular|motorcycle|motorsiklo|tricycle|truck|trak|bus|car|kotse|sasakyan|vehicle|van|jeep|jeepney|pedestrian|tumatawid|bisikleta|bicycle|siklista)\b/i;
  const prevention = /\b(?:seminar|simulation|drill|insurance|anniversary|accident prevention|road safety campaign)\b/i;
  const unrelatedCrash = /\b(?:stock market|stocks|market crash|software|computer|system crash|server crash)\b/i;
  return String(text || "").split(/(?<=[.!?])\s+|\n+/).some(sentence =>
    matchesRoadAccidentSearch(sentence) && roadContext.test(sentence) && !prevention.test(sentence) && !unrelatedCrash.test(sentence));
}
