import { ISABELA_PLACES } from "./locations";

export const INCIDENT_KEYWORDS = [
  "accident", "aksidente", "disgrasya", "nadisgrasya", "banggaan", "nagbanggaan", "nagkabanggaan",
  "salpukan", "sumalpok", "nasalpok", "nabangga", "bumangga", "tumaob", "tumagilid", "tumilapon",
  "nasagasaan", "sagasaan", "inararo", "nahulog sa bangin", "nawalan ng preno",
  "road crash", "vehicular accident", "motorcycle accident", "truck accident", "bus accident",
  "collision", "crash", "hit and run", "hit-and-run", "sugatan", "nasugatan", "injured", "patay",
  "nasawi", "namatay", "killed", "dead on arrival", "holdap", "holdaper", "hold-up", "robbery",
  "nakawan", "ninakaw", "ninakawan", "nilooban", "tinangay", "hablot", "akyat-bahay", "theft",
  "stolen", "sunog", "nasunog", "nagliyab", "tinupok ng apoy", "nilamon ng apoy", "fire", "blaze",
  "baha", "binaha", "pagbaha", "rumagasang tubig", "flood", "landslide", "pagguho", "gumuho",
  "rescue", "sinagip", "iniligtas", "saklolo", "emergency", "shooting", "pamamaril", "binaril",
  "nabaril", "pinagbabaril", "pinaslang", "pinatay", "stabbed", "pananaksak", "sinaksak",
  "nasaksak", "drowned", "nalunod", "missing person", "nawawala",
];

export function isRelevant(text) {
  const low = String(text || "").toLowerCase();
  const hasIncident = INCIDENT_KEYWORDS.some((word) => low.includes(word));
  const hasIsabela = /\bisabela\b/i.test(low) || ISABELA_PLACES.some((place) =>
    new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low));
  return hasIncident && hasIsabela;
}
