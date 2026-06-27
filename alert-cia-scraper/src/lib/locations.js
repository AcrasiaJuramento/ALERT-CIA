export const ISABELA_PLACES = [
  "Alicia", "Angadanan", "Aurora", "Benito Soliven", "Burgos", "Cabagan", "Cabatuan", "Cauayan",
  "Cordon", "Delfin Albano", "Dinapigue", "Divilacan", "Echague", "Gamu", "Ilagan", "Jones",
  "Luna", "Maconacon", "Mallig", "Naguilian", "Palanan", "Quezon", "Quirino", "Ramon",
  "Reina Mercedes", "Roxas", "San Agustin", "San Guillermo", "San Isidro", "San Manuel",
  "San Mariano", "San Mateo", "San Pablo", "Santa Maria", "Santiago", "Santo Tomas", "Tumauini",
].sort((a, b) => b.length - a.length);

const placePattern = ISABELA_PLACES.map((name) => name.replace(/ /g, "\\s+")).join("|");
const DISTINCTIVE_WITHOUT_PROVINCE = new Set([
  "Angadanan", "Benito Soliven", "Cabagan", "Delfin Albano", "Dinapigue", "Divilacan", "Echague",
  "Gamu", "Ilagan", "Jones", "Maconacon", "Mallig", "Palanan", "Reina Mercedes", "Tumauini",
]);

export function extractLocation(...texts) {
  const text = texts.filter(Boolean).join(" ").replace(/\s+/g, " ");
  const municipality = ISABELA_PLACES.find((name) =>
    new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "i").test(text));
  if (!municipality) return null;
  if (!/\bisabela\b/i.test(text) && !DISTINCTIVE_WITHOUT_PROVINCE.has(municipality)) return null;

  const barangayMatch = text.match(new RegExp(
    `\\b(?:Barangay|Brgy\\.?)\\s+([A-Za-z0-9][A-Za-z0-9 .'-]{1,45}?)(?=,|;|\\sin\\s|\\sat\\s|\\sof\\s|\\b(?:${placePattern})\\b|$)`,
    "i",
  ));
  const roadMatch = text.match(/\b([A-Z][A-Za-z0-9 .'-]{2,40}(?:Road|Highway|Street|Bridge|Junction))\b/);
  let barangay = barangayMatch?.[1]?.trim().replace(/[.,-]+$/, "") || null;
  if (barangay && /incident|accident|killed|injured|isabela/i.test(barangay)) barangay = null;

  const locationText = barangay
    ? `Barangay ${barangay}, ${municipality}, Isabela, Philippines`
    : `${municipality}, Isabela, Philippines`;
  return { barangay, municipality, road: roadMatch?.[1] || null, locationText };
}

export function isValidLocation(location) {
  return Boolean(location?.municipality && ISABELA_PLACES.includes(location.municipality));
}
