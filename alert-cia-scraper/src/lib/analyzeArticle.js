import { classifyIncident, incidentTypeLabel } from "./classify.js";
import { contentHash, extractStructuredAccidentDetails, extractVictimCount, incidentKey } from "./deduplication.js";
import { extractArticle } from "./extractArticle.js";
import { fetchHTML } from "./fetchHTML.js";
import { isAccidentRelevant } from "./filters.js";
import { geocode } from "./geocode.js";
import { extractIncidentDateTime } from "./incidentTime.js";
import { extractLocation, ISABELA_PLACES, isValidLocation } from "./locations.js";
import { normalizeUrl } from "./urls.js";

function textArticle({ title, snippet, body, url }) {
  return {
    title: title || String(body || "").split(/\n+/).find(Boolean)?.slice(0, 160) || "Pasted article text",
    snippet: snippet || String(body || "").replace(/\s+/g, " ").slice(0, 280),
    body: body || "",
    published_at: null,
    canonical_url: url ? normalizeUrl(url) : null,
  };
}

function decide({ article, sourceUrl, classification, location }) {
  if (!article.title) return { accepted: false, reason: "insufficient_information", details: "Article title could not be extracted." };
  const combined = `${article.title || ""}\n${article.snippet || ""}\n${article.body || ""}`;
  if (!isAccidentRelevant(combined) && classification.type !== "vehicular") {
    return { accepted: false, reason: classification.type ? "non_vehicular" : "non_accident", details: "No reliable vehicular accident context was detected." };
  }
  if (classification.type !== "vehicular") {
    return { accepted: false, reason: "non_vehicular", details: `Classified as ${classification.type || "unknown"}.` };
  }
  if (!classification.confidence || classification.confidence === "low") {
    return { accepted: false, reason: "low_confidence", details: classification.reason };
  }
  if (!location) return { accepted: false, reason: "location_unknown", details: "No Isabela location could be extracted from the accident context." };
  if (!isValidLocation(location)) {
    return { accepted: false, reason: "outside_isabela", details: `Extracted location was outside Isabela or unsupported: ${location.locationText || "unknown"}.` };
  }
  if (!location.municipality) {
    return { accepted: false, reason: "location_unknown", details: "No supported Isabela city or municipality could be extracted from the accident context." };
  }
  return { accepted: true, reason: "accepted", details: sourceUrl ? "Article would be accepted as a scraped vehicular accident candidate." : "Pasted text would be accepted as a scraped vehicular accident candidate." };
}

function hasIsabelaPlace(text = "") {
  return ISABELA_PLACES.some((place) => new RegExp(`\\b${place.replace(/ /g, "\\s+")}\\b`, "i").test(text));
}

function locationTextForSource(sourceUrl, combined) {
  try {
    const host = new URL(sourceUrl).hostname;
    if (host === "cauayan.bomboradyo.com" && hasIsabelaPlace(combined)) return `${combined}\nIsabela`;
  } catch {
    // Pasted text without a URL has no trusted source hint.
  }
  return combined;
}

export async function analyzeArticleInput({ url, title, snippet, body } = {}) {
  let article = null;
  let sourceUrl = normalizeUrl(url || "");
  let fetchError = null;

  if (sourceUrl) {
    const html = await fetchHTML(sourceUrl, { cacheTtlMs: 0, retries: 1 });
    if (html) {
      article = extractArticle(html, sourceUrl);
      sourceUrl = normalizeUrl(article.canonical_url || sourceUrl);
    } else {
      fetchError = "Article HTML could not be downloaded.";
    }
  }

  if (!article) article = textArticle({ title, snippet, body, url: sourceUrl });
  const combined = `${article.title || ""}\n${article.snippet || ""}\n${article.body || body || ""}`;
  const classification = classifyIncident(combined);
  const locationContext = locationTextForSource(sourceUrl, combined);
  const location = extractLocation(article.title, article.snippet, article.body || body, locationContext);
  const decision = fetchError
    ? { accepted: false, reason: "fetch_failed", details: fetchError }
    : decide({ article, sourceUrl, classification, location });
  const geo = decision.accepted ? await geocode(location) : null;
  const details = extractStructuredAccidentDetails(combined);
  const incidentDateTime = extractIncidentDateTime(combined, article.published_at);
  const record = decision.accepted ? {
    title: article.title,
    snippet: article.snippet,
    source_url: sourceUrl || null,
    source_site: "manual_analyzer",
    incident_type: classification.type,
    incident_type_key: classification.type,
    incident_type_label: incidentTypeLabel(classification.type),
    classification_confidence: classification.confidence,
    classification_score: classification.score,
    classification_reason: classification.reason,
    matched_terms: classification.matchedTerms,
    article_content_hash: contentHash(combined),
    location,
    location_text: location.locationText,
    location_confidence: {
      ...(location.confidence || {}),
      coordinates: geo?.geocode_confidence || 0,
    },
    published_at: article.published_at || new Date().toISOString(),
    incident_at: incidentDateTime?.incident_at || null,
    incident_time_source: incidentDateTime?.source || null,
    incident_time_evidence: incidentDateTime?.evidence || null,
    victim_count: extractVictimCount(combined),
    vehicle_types: details.vehicleTypes,
    injured_count: details.injuredCount,
    fatality_count: details.fatalityCount,
    involved_parties: details.involvedParties,
    lat: geo?.lat ?? null,
    lon: geo?.lon ?? null,
    display_name: geo?.display_name ?? null,
    geocoded_from: geo?.geocoded_from ?? null,
    geocode_status: geo?.geocode_status ?? "pending",
    geocode_precision: geo?.geocode_precision ?? null,
    geocode_confidence: geo?.geocode_confidence ?? 0,
  } : null;
  if (record) record.incident_key = incidentKey(record);

  return {
    success: true,
    accepted: decision.accepted,
    rejection_reason: decision.accepted ? null : decision.reason,
    decision_details: decision.details,
    source_url: sourceUrl || null,
    article: {
      title: article.title,
      snippet: article.snippet,
      published_at: article.published_at,
    },
    classification,
    location,
    geocode: geo,
    structured: details,
    preview_record: record,
  };
}
