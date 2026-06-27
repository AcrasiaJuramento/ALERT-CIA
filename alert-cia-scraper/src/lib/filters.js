import { ISABELA_PLACES } from "./locations";

export const INCIDENT_KEYWORDS = [
  "accident", "aksidente", "banggaan", "salpukan", "nabangga", "bumangga", "tumaob",
  "road crash", "vehicular accident", "motorcycle accident", "truck accident", "bus accident",
  "collision", "crash", "hit and run", "hit-and-run", "sugatan", "injured", "patay", "killed",
  "dead on arrival", "holdap", "hold-up", "robbery", "nakawan", "theft", "stolen", "sunog",
  "fire", "blaze", "baha", "flood", "landslide", "pagguho", "rescue", "emergency",
  "shooting", "binaril", "stabbed", "sinaksak", "drowned", "nalunod", "missing person",
];

export function isRelevant(text) {
  const low = String(text || "").toLowerCase();
  const hasIncident = INCIDENT_KEYWORDS.some((word) => low.includes(word));
  const hasIsabela = /\bisabela\b/i.test(low) || ISABELA_PLACES.some((place) =>
    new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low));
  return hasIncident && hasIsabela;
}
