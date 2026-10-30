export const ISABELA_PLACES = [
  "Alicia", "Angadanan", "Aurora", "Benito Soliven", "Burgos", "Cabagan", "Cabatuan", "Cauayan",
  "Cordon", "Delfin Albano", "Dinapigue", "Divilacan", "Echague", "Gamu", "Ilagan", "Jones",
  "Luna", "Maconacon", "Mallig", "Naguilian", "Palanan", "Quezon", "Quirino", "Ramon",
  "Reina Mercedes", "Roxas", "San Agustin", "San Guillermo", "San Isidro", "San Manuel",
  "San Mariano", "San Mateo", "San Pablo", "Santa Maria", "Santiago", "Santo Tomas", "Tumauini",
].sort((a, b) => b.length - a.length);

const incident = /\b(?:accident|aksidente|disgrasya|banggaan|nagbanggaan|nagkabanggaan|salpukan|sumalpok|sinalpok|nasalpok|nabangga|bumangga|tumaob|tumagilid|nasagasaan|collision|crash|nahulog|nasawi|killed|injured)\b/i;
const foreignLocation = /\b(?:sa|in|at)\s+(?:[^.!?\n]{0,60}?\s+)?(?:Turkiye|Türkiye|Turkey|Japan|China|Taiwan|Korea|Indonesia|India|Pakistan|Thailand|Malaysia|Vietnam|America|USA|United States)\b/i;

export function incidentBarangayNames(...texts) {
  return [...new Set(texts.filter(Boolean).flatMap(text => stripNewsDateline(text).split(/(?<=[.!?])\s+|\n+/))
    .filter(sentence => incident.test(sentence))
    .map(sentence => sentence.split(/\b(?:residente|resident|residing|mula sa|galing sa|patungo sa|bound for|from)\b/i)[0])
    .flatMap(sentence => [...sentence.matchAll(/\b(?:Barangay|Brgy\.?|Bgy\.?|Baryo)\s+([A-Za-z0-9][A-Za-z0-9 '-]{0,55}?)(?=[,.;!?]|\s+(?:sa|in|at|ng|of)\b|$)/gi)].map(match => match[1].trim())))];
}

export function stripNewsDateline(text = "") {
  // A newsroom dateline is not evidence of where the incident happened.
  const localDateline = new RegExp(`^\\s*(?:${ISABELA_PLACES.join("|")})(?:\\s+City)?(?:,\\s*Isabela)?\\s*[—–-]\\s*`, "i");
  return String(text).replace(localDateline, "").replace(/^\s*(?:[A-ZÀ-Ü][A-ZÀ-Ü .'()]{2,55})(?:,\s*[A-Za-zÀ-ü .]{2,40})?\s*(?:[—–]|-(?!\w))\s*/u, "");
}

export function incidentLocationEvidence(...texts) {
  const parts = texts.filter(Boolean).map(text => stripNewsDateline(text)
    .replace(/\bBombo\s+Radyo\s+(?:Cauayan|Tuguegarao|Philippines)\b/gi, "the newsroom"));
  if (foreignLocation.test(parts[0] || "")) return [];
  const sentences = parts.flatMap(text => text.split(/(?<=[!?])\s+|(?<=\.)\s+(?!City\b)|\n+/));
  return sentences.filter(sentence => incident.test(sentence) && !foreignLocation.test(sentence)).flatMap(sentence => {
    // Do not use the residence, origin or destination of a victim as the crash site.
    const siteText = sentence.split(/\b(?:residente|resident|residing|taga-|mula sa|galing sa|patungo sa|bound for|from)\b/i)[0];
    return ISABELA_PLACES.filter(place => {
      const name = place.replace(/ /g, "\\s+");
      const mention = new RegExp(`\\b${name}\\b`, "ig");
      const municipalityText = siteText.replace(mention, (match, offset) =>
        /\b(?:barangay|brgy\.?|bgy\.?|sitio|purok)\s*$/i.test(siteText.slice(0, offset)) ? "local area" : match);
      return new RegExp(`\\b(?:sa|in|at|along|near|naganap sa|nangyari sa)\\s+(?:(?:lungsod|bayan|city|municipality)\\s+(?:ng|of)\\s+)?(?:[^.!?;\\n]{0,100}?,?\\s+)?${name}(?:\\s+City)?\\b`, "i").test(municipalityText);
    }).map(municipality => ({ municipality, text: siteText.trim() }));
  });
}

export function hasSupportedIncidentLocation(row = {}) {
  // Explicit location corrections remain authoritative; approval alone is insufficient.
  if (row.location_corrected_at || row.location_confidence?.corrected === true) return true;
  const article = row.raw_payload?.article || {};
  const municipality = String(row.verified_municipality || row.extracted_municipality || row.raw_payload?.location?.municipality || "")
    .replace(/\b(?:city|municipality)\b/ig, "").trim();
  const evidence = incidentLocationEvidence(row.title || article.title, row.snippet || article.snippet,
    article.body || row.raw_payload?.body || row.location_confidence?.evidence);
  const places = new Set(evidence.map(item => item.municipality));
  if (places.size !== 1 || [...places][0].toLowerCase() !== municipality.toLowerCase()) return false;
  const barangays = incidentBarangayNames(row.title || article.title, row.snippet || article.snippet,
    article.body || row.raw_payload?.body || row.location_confidence?.evidence);
  const storedBarangay = row.verified_barangay || row.extracted_barangay || row.raw_payload?.location?.barangay || "";
  const normalize = value => String(value).toLowerCase().replace(/\b(?:barangay|brgy|bgy)\b/g, "").replace(/[^a-z0-9]/g, "");
  if (!storedBarangay) return !barangays.length;
  return barangays.length === 1 && normalize(barangays[0]) === normalize(storedBarangay);
}
