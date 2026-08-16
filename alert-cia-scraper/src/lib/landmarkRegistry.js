import { getSupabaseAdminClient, isSupabaseEnabled } from "./supabase.js";

const LANDMARK_EVIDENCE_PATTERN = /\b(?:near|front of|in front of|beside|across|at|inside|within|along|corner|intersection|junction|tapat ng|malapit sa|sa harap ng|harap ng|tabi ng)\b/i;
const CATEGORY_HINTS = /\b(?:school|elementary|high school|college|university|church|chapel|hospital|clinic|barangay hall|municipal hall|police|fire station|gas station|fuel station|market|bridge|terminal|hardware|mall|store|junction|intersection)\b/i;

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\belementary school\b/g, "elem school")
    .replace(/\belementary\b/g, "elem")
    .replace(/\bnational high school\b/g, "nhs")
    .replace(/\bhigh school\b/g, "hs")
    .replace(/\bgeneral\b/g, "gen")
    .replace(/\bsanta\b/g, "sta")
    .replace(/\bsanto\b/g, "sto")
    .replace(/[^a-z0-9]+/g, "");
}

function textWindow(text = "", index = 0, radius = 80) {
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius));
}

function variantNames(landmark = {}) {
  return [landmark.name, ...(landmark.aliases || [])]
    .map(value => String(value || "").trim())
    .filter(value => value.length >= 3);
}

function sourceRank(landmark = {}) {
  if (landmark.officer_verified || landmark.verification_status === "officer_verified") return 1;
  if (landmark.source === "lgu" || landmark.source === "government") return 2;
  if (landmark.verification_status === "auto_validated") return 3;
  if (landmark.source === "osm") return 4;
  return 5;
}

export async function loadLandmarkRegistry() {
  if (!isSupabaseEnabled()) return [];
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("landmarks")
    .select("id,name,aliases,category,barangay,municipality,province,latitude,longitude,source,source_id,verification_status,officer_verified,validation_status,detected_barangay,detected_municipality")
    .is("deleted_at", null)
    .in("validation_status", ["valid"])
    .in("verification_status", ["officer_verified", "auto_validated"])
    .limit(5000);
  if (error) {
    console.warn("[alert-cia-scraper] landmark registry unavailable", error.message);
    return [];
  }
  return (data || []).filter(row => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
}

export function matchLocalLandmark({ text = "", location = {}, landmarks = [] } = {}) {
  if (!text || !landmarks.length || !location?.municipality) return null;
  const expectedMunicipality = normalize(location.municipality);
  const expectedBarangay = normalize(location.barangay);
  const normalizedText = normalize(text);
  const candidates = [];

  for (const landmark of landmarks) {
    if (normalize(landmark.municipality) !== expectedMunicipality) continue;
    if (expectedBarangay && normalize(landmark.barangay || landmark.detected_barangay) !== expectedBarangay) continue;

    for (const variant of variantNames(landmark)) {
      const normalizedVariant = normalize(variant);
      if (!normalizedVariant || !normalizedText.includes(normalizedVariant)) continue;
      const index = text.toLowerCase().indexOf(String(variant).toLowerCase());
      const context = textWindow(text, index >= 0 ? index : 0);
      if (!LANDMARK_EVIDENCE_PATTERN.test(context) && !CATEGORY_HINTS.test(variant)) continue;

      candidates.push({
        ...landmark,
        matchedAlias: variant,
        sourcePriority: sourceRank(landmark),
        context,
      });
      break;
    }
  }

  candidates.sort((left, right) =>
    left.sourcePriority - right.sourcePriority ||
    String(right.matchedAlias || "").length - String(left.matchedAlias || "").length
  );
  return candidates[0] || null;
}

export function applyLandmarkMatch(record = {}, landmark = null) {
  if (!landmark) return record;
  return {
    ...record,
    lat: Number(landmark.latitude),
    lon: Number(landmark.longitude),
    display_name: `${landmark.name}, ${landmark.barangay || landmark.detected_barangay || record.location?.barangay || ""}, ${landmark.municipality}, Isabela, Philippines`,
    geocoded_from: `local landmark registry:${landmark.id}`,
    geocode_status: "success",
    geocode_precision: "landmark",
    geocode_confidence: 1,
    location: {
      ...(record.location || {}),
      landmark: landmark.name,
      landmarkId: landmark.id,
      landmarkCategory: landmark.category,
      barangay: landmark.barangay || landmark.detected_barangay || record.location?.barangay,
      municipality: landmark.municipality || record.location?.municipality,
    },
    location_confidence: {
      ...(record.location_confidence || record.location?.confidence || {}),
      source: "landmark",
      level: "high",
      accuracy: "near_exact",
      landmark_id: landmark.id,
      landmark_name: landmark.name,
      matched_alias: landmark.matchedAlias,
      reason: "Matched officer/local verified landmark and passed stored barangay validation.",
    },
  };
}
