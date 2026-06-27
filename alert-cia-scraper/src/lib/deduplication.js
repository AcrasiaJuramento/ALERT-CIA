import crypto from "node:crypto";

const STOP_WORDS = new Set([
  "ang", "and", "are", "ay", "dahil", "for", "from", "has", "have", "isang", "isabela", "matapos",
  "mga", "mula", "nang", "ng", "para", "sa", "the", "this", "umano", "with",
]);

const FILIPINO_NUMBERS = new Map([
  ["isa", 1], ["isang", 1], ["dalawa", 2], ["dalawang", 2], ["tatlo", 3], ["tatlong", 3],
  ["apat", 4], ["limang", 5], ["lima", 5], ["anim", 6], ["pito", 7], ["walo", 8],
  ["siyam", 9], ["sampu", 10],
]);

export function normalizedWords(value = "") {
  return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function extractVictimCount(text = "") {
  const value = String(text);
  const victimTerms = "people|persons?|passengers?|victims?|katao|indibidwal|motorsiklista|sakay|patay|nasawi|namatay|sugatan|nasugatan|injured|killed";
  const numeric = value.match(new RegExp(`\\b(\\d{1,3})\\s+(?:na\\s+)?(?:${victimTerms})\\b`, "i"));
  if (numeric) return Number(numeric[1]);
  const word = value.match(new RegExp(`\\b(${[...FILIPINO_NUMBERS.keys()].join("|")})\\s+(?:na\\s+)?(?:${victimTerms})\\b`, "i"));
  return word ? FILIPINO_NUMBERS.get(word[1].toLowerCase()) ?? null : null;
}

export function incidentKey(item) {
  const day = item.published_at ? new Date(item.published_at).toISOString().slice(0, 10) : "unknown-date";
  const keywords = [...new Set(normalizedWords(item.title))].sort().slice(0, 12).join("-");
  return crypto.createHash("sha256").update([
    item.incident_type_key,
    item.location?.municipality,
    item.location?.barangay,
    day,
    keywords,
    item.victim_count ?? "",
    item.location?.road || "",
  ].join("|").toLowerCase()).digest("hex");
}

function tokenSimilarity(a, b) {
  const left = new Set(normalizedWords(a));
  const right = new Set(normalizedWords(b));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  return (2 * intersection) / (left.size + right.size);
}

export function similarityScore(left, right) {
  const title = tokenSimilarity(left.title, right.title);
  const location = tokenSimilarity(left.location_text, right.location_text);
  const type = left.incident_type_key === right.incident_type_key ? 1 : 0;
  const leftDate = new Date(left.published_at || 0).getTime();
  const rightDate = new Date(right.published_at || 0).getTime();
  const hours = leftDate && rightDate ? Math.abs(leftDate - rightDate) / 36e5 : 999;
  const date = hours <= 24 ? 1 : hours <= 48 ? 0.7 : 0;
  const victim = left.victim_count == null || right.victim_count == null ? 0.5 : left.victim_count === right.victim_count ? 1 : 0;
  return Number((title * 0.42 + location * 0.23 + type * 0.2 + date * 0.1 + victim * 0.05).toFixed(4));
}
