import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ISABELA_PLACES = [
  "Alicia", "Angadanan", "Aurora", "Benito Soliven", "Burgos", "Cabagan", "Cabatuan", "Cauayan",
  "Cordon", "Delfin Albano", "Dinapigue", "Divilacan", "Echague", "Gamu", "Ilagan", "Jones",
  "Luna", "Maconacon", "Mallig", "Naguilian", "Palanan", "Quezon", "Quirino", "Ramon",
  "Reina Mercedes", "Roxas", "San Agustin", "San Guillermo", "San Isidro", "San Manuel",
  "San Mariano", "San Mateo", "San Pablo", "Santa Maria", "Santiago", "Santo Tomas", "Tumauini",
].sort((a, b) => b.length - a.length);

const ISABELA_CITIES = new Set(["Cauayan", "Ilagan", "Santiago"]);
const placePattern = ISABELA_PLACES.map((name) => name.replace(/ /g, "\\s+")).join("|");
const INCIDENT_CONTEXT_PATTERN = /\b(accident|aksidente|banggaan|nagbanggaan|salpukan|sumalpok|sinalpok|nasalpok|nabangga|bumangga|tumaob|tumagilid|nasagasaan|collision|crash|vehicular|motorcycle|motorsiklo|truck|bus|sasakyan)\b/i;
const DISTINCTIVE_WITHOUT_PROVINCE = new Set([
  "Angadanan", "Benito Soliven", "Cabagan", "Delfin Albano", "Dinapigue", "Divilacan", "Echague",
  "Gamu", "Ilagan", "Jones", "Maconacon", "Mallig", "Palanan", "Reina Mercedes", "Tumauini",
]);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLocationName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\bgeneral\b/g, "gen")
    .replace(/\bsanta\b/g, "sta")
    .replace(/\bsanto\b/g, "sto")
    .replace(/\b(?:1|i|one|uno)\b/g, "1")
    .replace(/\b(?:2|ii|two|dos)\b/g, "2")
    .replace(/\b(?:3|iii|three|tres)\b/g, "3")
    .replace(/\b(?:4|iv|four|kwatro|cuatro)\b/g, "4")
    .replace(/\b(?:5|v|five|singko|cinco)\b/g, "5")
    .replace(/\b(?:city|municipality|barangay|brgy|bgy|baryo|poblacion)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function expandBarangayAliases(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const variants = new Set([text]);
  const replacements = [
    ["I", "1"],
    ["II", "2"],
    ["III", "3"],
    ["IV", "4"],
    ["V", "5"],
  ];

  for (const [roman, digit] of replacements) {
    variants.add(text.replace(new RegExp(`\\b${roman}\\b`, "gi"), digit));
    variants.add(text.replace(new RegExp(`\\b${digit}\\b`, "g"), roman));
  }

  return [...variants].filter(Boolean);
}

function readIsabelaGeoJson() {
  const candidates = [
    process.env.ISABELA_GEOJSON_PATH,
    path.resolve(process.cwd(), "src/data/Isabela.geojson"),
    path.resolve(process.cwd(), "src/app/data/Isabela.geojson"),
    path.resolve(process.cwd(), "../src/app/data/Isabela.geojson"),
    path.resolve(moduleDir, "../data/Isabela.geojson"),
    path.resolve(moduleDir, "../../../src/app/data/Isabela.geojson"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {
      // Keep the scraper usable even when a deployment does not include the boundary file.
    }
  }
  return null;
}

function buildBoundaryLocationIndex() {
  const collection = readIsabelaGeoJson();
  const pairs = [];
  const seen = new Set();

  for (const feature of collection?.features || []) {
    const properties = feature.properties || {};
    const municipality = canonicalMunicipality(properties.NAME_2 || properties.MUNICIPALITY);
    const barangay = cleanBarangay(properties.NAME_3 || properties.BARANGAY || properties.name);
    if (!municipality || !barangay) continue;

    const aliases = [
      ...expandBarangayAliases(barangay).map(alias => ({ alias, canonical: true })),
      ...[properties.VARNAME_3]
        .filter(value => value && value !== "NA")
        .flatMap(expandBarangayAliases)
        .map(alias => ({ alias, canonical: false })),
    ];
    for (const { alias, canonical } of aliases) {
      const key = `${normalizeLocationName(alias)}|${normalizeLocationName(municipality)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        barangay,
        municipality,
        alias: String(alias).replace(/\s+/g, " ").trim(),
        canonical,
      });
    }
  }

  return pairs.sort((left, right) => Number(right.canonical) - Number(left.canonical) || right.alias.length - left.alias.length);
}

const boundaryLocationPairs = buildBoundaryLocationIndex();

function canonicalMunicipality(value) {
  const normalized = String(value || "")
    .replace(/\b(?:city|municipality)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return ISABELA_PLACES.find((place) => place.toLowerCase() === normalized) || null;
}

function municipalityMatches(text) {
  const matches = [];
  for (const place of ISABELA_PLACES) {
    const pattern = new RegExp(`\\b${place.replace(/ /g, "\\s+")}\\b`, "ig");
    for (const match of text.matchAll(pattern)) matches.push({ name: place, index: match.index });
  }
  return matches.sort((left, right) => left.index - right.index);
}

function cleanBarangay(value) {
  const cleaned = String(value || "")
    .replace(/^(?:barangay|brgy\.?|bgy\.?|baryo)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length > 60) return null;
  if (/\b(?:incident|accident|aksidente|killed|injured|isabela|province)\b/i.test(cleaned)) return null;
  return cleaned;
}

function cleanPurokSitio(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "").trim();
  if (!cleaned || cleaned.length > 50) return null;
  return cleaned;
}

function candidateTexts(text) {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const sentences = normalized.split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
  const incidentSentences = sentences.filter((sentence) => INCIDENT_CONTEXT_PATTERN.test(sentence));
  return [...incidentSentences, normalized].filter(Boolean);
}

function findBoundaryLocation(text) {
  if (!boundaryLocationPairs.length) return null;
  const normalizedText = normalizeLocationName(text);

  for (const pair of boundaryLocationPairs) {
    const barangayPattern = escapeRegex(pair.alias).replace(/\s+/g, "\\s+");
    const municipalityPattern = escapeRegex(pair.municipality).replace(/\s+/g, "\\s+");
    const compactPair = `${normalizeLocationName(pair.alias)}${normalizeLocationName(pair.municipality)}`;
    const patterns = [
      new RegExp(`\\b(?:Barangay|Brgy\\.?|Bgy\\.?|Baryo)?\\s*${barangayPattern}\\s*,\\s*${municipalityPattern}(?:\\s+(?:City|Municipality))?\\b`, "i"),
      new RegExp(`\\b(?:Barangay|Brgy\\.?|Bgy\\.?|Baryo)?\\s*${barangayPattern}\\s+(?:in|at|of|ng|sa)\\s+${municipalityPattern}(?:\\s+(?:City|Municipality))?\\b`, "i"),
    ];
    if (patterns.some(pattern => pattern.test(text)) || normalizedText.includes(compactPair)) {
      return {
        barangay: pair.barangay,
        municipality: pair.municipality,
        source: "Isabela.geojson",
        matchedAlias: pair.alias,
      };
    }
  }

  return null;
}

export function resolveIsabelaGeoJsonLocation(text) {
  return findBoundaryLocation(text);
}

function findAdministrativeLocation(text) {
  const boundaryLocation = findBoundaryLocation(text);
  if (boundaryLocation) return boundaryLocation;

  const explicit = text.match(new RegExp(
    `\\b(?:Barangay|Brgy\\.?|Bgy\\.?|Baryo)\\s+([A-Za-z0-9][A-Za-z0-9 .'-]{1,58}?)\\s*,\\s*(${placePattern})(?:\\s+(?:City|Municipality))?\\s*,?\\s*(?:Province\\s+of\\s+)?Isabela\\b`,
    "i",
  ));
  if (explicit) return { barangay: cleanBarangay(explicit[1]), municipality: canonicalMunicipality(explicit[2]) };

  const barangayMatch = text.match(new RegExp(
    `\\b(?:Barangay|Brgy\\.?|Bgy\\.?|Baryo)\\s+([A-Za-z0-9][A-Za-z0-9 .'-]{1,58}?)(?=,|;|\\s+(?:in|at|of|ng|sa)\\s+|\\b(?:${placePattern})\\b|\\bIsabela\\b|$)`,
    "i",
  ));
  const barangay = cleanBarangay(barangayMatch?.[1]);
  if (barangayMatch) {
    const afterBarangay = municipalityMatches(text).find((match) => match.index >= barangayMatch.index);
    if (afterBarangay) return { barangay, municipality: afterBarangay.name };
  }

  const pairedMunicipality = text.match(new RegExp(
    `\\b(${placePattern})(?:\\s+(?:City|Municipality))?\\s*,?\\s*(?:Province\\s+of\\s+)?Isabela\\b`,
    "i",
  ));
  return {
    barangay,
    municipality: canonicalMunicipality(pairedMunicipality?.[1]) || municipalityMatches(text)[0]?.name || null,
  };
}

export function extractLocation(...texts) {
  const text = texts.filter(Boolean).join(" ").replace(/\s+/g, " ");
  const selectedText = candidateTexts(text).find((candidate) => {
    const found = findAdministrativeLocation(candidate);
    return found.barangay || found.municipality || /\bisabela\b/i.test(candidate);
  }) || text;
  const administrativeLocation = findAdministrativeLocation(selectedText);
  const { barangay, municipality } = administrativeLocation;
  const explicitlyIsabela = /\bisabela\b/i.test(text);
  if (!municipality && !barangay && !explicitlyIsabela) return null;
  if (!administrativeLocation?.source && !explicitlyIsabela && (!municipality || !DISTINCTIVE_WITHOUT_PROVINCE.has(municipality))) return null;

  const roadMatch = text.match(/\b([A-Z][A-Za-z0-9 .'-]{2,50}(?:Road|Highway|Street|Bridge|Junction|Avenue))\b/);
  const purokSitio = cleanPurokSitio(text.match(/\b(?:Purok|Sitio|Zone)\s+([A-Za-z0-9 .'-]{1,45})/i)?.[0]);
  const municipalityType = municipality ? (ISABELA_CITIES.has(municipality) ? "city" : "municipality") : null;
  const barangayLabel = barangay ? `Barangay ${barangay}` : null;
  const municipalityLabel = municipality
    ? `${municipalityType === "city" ? "City" : "Municipality"} of ${municipality}`
    : null;
  const province = "Isabela";
  const locationText = [barangayLabel, municipality, province, "Philippines"].filter(Boolean).join(", ");

  return {
    barangay,
    barangayLabel,
    municipality,
    municipalityType,
    municipalityLabel,
    province,
    provinceLabel: `Province of ${province}`,
    country: "Philippines",
    purokSitio,
    road: roadMatch?.[1] || null,
    locationText,
    rawLocationText: selectedText.slice(0, 500),
    confidence: {
      province: explicitlyIsabela ? 1 : 0.65,
      municipality: municipality ? (INCIDENT_CONTEXT_PATTERN.test(selectedText) ? 0.85 : 0.65) : 0,
      barangay: barangay ? (INCIDENT_CONTEXT_PATTERN.test(selectedText) ? 0.85 : 0.65) : 0,
      hierarchy: administrativeLocation?.source === "Isabela.geojson" ? 1 : 0,
      road: roadMatch ? 0.7 : 0,
    },
  };
}

export function isValidLocation(location) {
  return Boolean(
    location?.province === "Isabela" &&
    (!location.municipality || ISABELA_PLACES.includes(location.municipality)),
  );
}
