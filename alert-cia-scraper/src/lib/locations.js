export const ISABELA_PLACES = [
  "Alicia", "Angadanan", "Aurora", "Benito Soliven", "Burgos", "Cabagan", "Cabatuan", "Cauayan",
  "Cordon", "Delfin Albano", "Dinapigue", "Divilacan", "Echague", "Gamu", "Ilagan", "Jones",
  "Luna", "Maconacon", "Mallig", "Naguilian", "Palanan", "Quezon", "Quirino", "Ramon",
  "Reina Mercedes", "Roxas", "San Agustin", "San Guillermo", "San Isidro", "San Manuel",
  "San Mariano", "San Mateo", "San Pablo", "Santa Maria", "Santiago", "Santo Tomas", "Tumauini",
].sort((a, b) => b.length - a.length);

const ISABELA_CITIES = new Set(["Cauayan", "Ilagan", "Santiago"]);
const placePattern = ISABELA_PLACES.map((name) => name.replace(/ /g, "\\s+")).join("|");
const DISTINCTIVE_WITHOUT_PROVINCE = new Set([
  "Angadanan", "Benito Soliven", "Cabagan", "Delfin Albano", "Dinapigue", "Divilacan", "Echague",
  "Gamu", "Ilagan", "Jones", "Maconacon", "Mallig", "Palanan", "Reina Mercedes", "Tumauini",
]);

function canonicalMunicipality(value) {
  return ISABELA_PLACES.find((place) => place.toLowerCase() === String(value || "").replace(/\s+/g, " ").trim().toLowerCase()) || null;
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

function findAdministrativeLocation(text) {
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
  const { barangay, municipality } = findAdministrativeLocation(text);
  const explicitlyIsabela = /\bisabela\b/i.test(text);
  if (!municipality && !barangay && !explicitlyIsabela) return null;
  if (!explicitlyIsabela && (!municipality || !DISTINCTIVE_WITHOUT_PROVINCE.has(municipality))) return null;

  const roadMatch = text.match(/\b([A-Z][A-Za-z0-9 .'-]{2,50}(?:Road|Highway|Street|Bridge|Junction|Avenue))\b/);
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
    road: roadMatch?.[1] || null,
    locationText,
  };
}

export function isValidLocation(location) {
  return Boolean(
    location?.province === "Isabela" &&
    (!location.municipality || ISABELA_PLACES.includes(location.municipality)),
  );
}
