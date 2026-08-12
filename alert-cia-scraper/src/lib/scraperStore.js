import crypto from "node:crypto";
import { SOURCES } from "../constants/sources.js";
import { similarityScore } from "./deduplication.js";
import { getSupabaseAdminClient, isSupabaseEnabled } from "./supabase.js";

const hash = (value = "") => crypto.createHash("sha256").update(value).digest("hex");

function chunks(values, size = 100) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export async function findExistingSourceUrls(urls = []) {
  const found = new Set();
  if (!isSupabaseEnabled() || !urls.length) return found;
  const client = getSupabaseAdminClient();
  for (const group of chunks([...new Set(urls)])) {
    const { data, error } = await client.from("incident_sources").select("source_url").in("source_url", group);
    if (error) {
      // The migration may not be applied yet; fall back to the legacy table during rollout.
      const legacy = await client.from("scraper_records").select("source_url").in("source_url", group).is("deleted_at", null);
      if (legacy.error) return found;
      (legacy.data || []).forEach((row) => found.add(row.source_url));
    } else {
      (data || []).forEach((row) => found.add(row.source_url));
    }
  }
  return found;
}

export async function getScraperSourceHealthSnapshot(sourceKeys = []) {
  const keys = [...new Set(sourceKeys)].filter(Boolean);
  if (!isSupabaseEnabled() || !keys.length) return new Map();
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("scraper_source_health")
    .select("source_key,last_scraped_at,last_success_at,status")
    .in("source_key", keys);
  if (error) return new Map();
  return new Map((data || []).map((row) => [row.source_key, row]));
}

async function findExistingContentHashIncidents(client, hashes = []) {
  const found = new Map();
  const uniqueHashes = [...new Set(hashes)].filter(Boolean);
  if (!uniqueHashes.length) return found;
  for (const group of chunks(uniqueHashes)) {
    const { data, error } = await client.from("scraped_incidents")
      .select("id,article_content_hash")
      .in("article_content_hash", group);
    if (error) return found;
    (data || []).forEach((row) => {
      if (row.article_content_hash) found.set(row.article_content_hash, row);
    });
  }
  return found;
}

export async function getScrapedIncidentSnapshot({ limit = 1000 } = {}) {
  if (!isSupabaseEnabled()) return null;
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("scraped_incidents")
    .select("id, incident_key, title, snippet, incident_type_key, incident_type_label, location_text, municipality, barangay, road_place, victim_count, geocoded_from, geocode_status, geocode_confidence, latitude, longitude, display_name, published_at, source_count, confidence_score, sources:incident_sources(source_site, source_url, source_title, source_snippet, published_at)")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) return null;
  return (data || []).map((incident) => {
    const primarySource = [...(incident.sources || [])]
      .sort((left, right) => new Date(left.published_at || 0) - new Date(right.published_at || 0))[0] || {};
    return {
      id: incident.id,
      incident_key: incident.incident_key,
      title: incident.title,
      snippet: incident.snippet,
      incident_type: incident.incident_type_key,
      incident_type_key: incident.incident_type_key,
      incident_type_label: incident.incident_type_label,
      location: incident.location_text,
      location_text: incident.location_text,
      municipality: incident.municipality,
      barangay: incident.barangay,
      road_place: incident.road_place,
      victim_count: incident.victim_count,
      lat: incident.latitude,
      lon: incident.longitude,
      display_name: incident.display_name,
      geocoded_from: incident.geocoded_from,
      geocode_status: incident.geocode_status,
      geocode_confidence: incident.geocode_confidence,
      published_at: incident.published_at,
      source_count: incident.source_count,
      confidence_score: incident.confidence_score,
      source_site: primarySource.source_site || null,
      source_url: primarySource.source_url || null,
      sources: incident.sources || [],
    };
  });
}

async function syncSources(client) {
  const removedSourceKeys = ["sunstar", "pna", "pilipino_star"];
  const removal = await client.from("scraper_sources").delete().in("source_key", removedSourceKeys);
  if (removal.error) throw removal.error;

  const payload = SOURCES.map((source) => ({
    source_key: source.key,
    name: source.name,
    base_url: source.baseUrl,
    search_url: source.firstPageUrl,
    active: source.enabled,
    metadata: {
      loading_strategy: source.loadingStrategy,
      pagination_type: source.paginationType,
      max_pages_full: source.maxPagesFull,
      max_pages_update: source.maxPagesUpdate,
      discovery_limits: source.discoveryLimits,
      api_items_path: source.apiItemsPath,
      api_url_path: source.apiUrlPath,
      scroll_url: source.scrollUrl,
      search_terms: source.searchTerms,
      search_urls: source.searchTerms?.map((term) => source.searchUrl?.(term, 1)).filter(Boolean) || null,
      allowed_domains: source.allowedDomains,
    },
  }));
  const { data, error } = await client.from("scraper_sources").upsert(payload, { onConflict: "source_key" }).select("id, source_key");
  if (error) throw error;
  return new Map(data.map((row) => [row.source_key, row.id]));
}

function incidentRow(record) {
  const autoReview = autoReviewDecision(record);
  return {
    incident_key: record.incident_key,
    title: record.title,
    snippet: record.snippet,
    incident_type_key: record.incident_type_key,
    incident_type_label: record.incident_type_label,
    location_text: record.location_text,
    municipality: record.location?.municipality || null,
    barangay: record.location?.barangay || null,
    road_place: record.location?.road || null,
    victim_count: record.victim_count,
    classification_confidence: record.classification_confidence || null,
    classification_score: record.classification_score || 0,
    classification_reason: record.classification_reason || null,
    matched_terms: record.matched_terms || [],
    article_content_hash: record.article_content_hash || null,
    raw_location_text: record.location?.rawLocationText || record.location_text || null,
    purok_sitio: record.location?.purokSitio || null,
    location_confidence: record.location_confidence || record.location?.confidence || {},
    vehicle_types: record.vehicle_types || [],
    injured_count: record.injured_count ?? null,
    fatality_count: record.fatality_count ?? null,
    involved_parties: record.involved_parties || [],
    geocoded_from: record.geocoded_from,
    geocode_status: record.geocode_status,
    geocode_confidence: record.geocode_confidence,
    latitude: record.lat,
    longitude: record.lon,
    display_name: record.display_name,
    published_at: record.published_at,
    last_seen_at: new Date().toISOString(),
    confidence_score: record.geocode_confidence || 0.5,
    needs_manual_review: !autoReview.accepted,
    verified_at: autoReview.accepted ? new Date().toISOString() : null,
    verified_municipality: autoReview.accepted ? record.location?.municipality || null : null,
    verified_barangay: autoReview.accepted ? record.location?.barangay || null : null,
    verified_purok_sitio: autoReview.accepted ? record.location?.purokSitio || null : null,
    verified_road_place: autoReview.accepted ? record.location?.road || null : null,
  };
}

function autoReviewDecision(record = {}) {
  const hasCoordinates = Number.isFinite(record.lat) && Number.isFinite(record.lon);
  const required = {
    title: Boolean(record.title),
    source_url: Boolean(record.source_url),
    published_at: Boolean(record.published_at),
    vehicular: record.incident_type_key === "vehicular",
    high_confidence: record.classification_confidence === "high",
    municipality: Boolean(record.location?.municipality),
    barangay: Boolean(record.location?.barangay),
    coordinates: hasCoordinates && record.geocode_status === "success",
  };
  const missing = Object.entries(required).filter(([, passed]) => !passed).map(([key]) => key);
  return {
    accepted: missing.length === 0,
    missing,
    reason: missing.length
      ? `Needs manual review: missing ${missing.join(", ")}.`
      : "Auto-approved: high-confidence non-duplicate vehicular accident with barangay and coordinates.",
  };
}

async function findSimilarIncident(client, record) {
  const published = new Date(record.published_at);
  const from = new Date(published.getTime() - 48 * 36e5).toISOString();
  const to = new Date(published.getTime() + 48 * 36e5).toISOString();
  const { data, error } = await client.from("scraped_incidents")
    .select("id, incident_key, title, incident_type_key, location_text, published_at, victim_count, snippet, geocode_status, geocoded_from, geocode_confidence, latitude, longitude, display_name, confidence_score")
    .eq("incident_type_key", record.incident_type_key)
    .gte("published_at", from).lte("published_at", to).limit(100);
  if (error) throw error;
  let best = null;
  for (const candidate of data || []) {
    const score = similarityScore(record, candidate);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  return best?.score >= 0.75 ? best : null;
}

async function addIncidentSource(client, incidentId, record) {
  const { error } = await client.from("incident_sources").upsert({
    incident_id: incidentId,
    source_site: record.source_site,
    source_url: record.source_url,
    source_title: record.title,
    source_snippet: record.snippet,
    published_at: record.published_at,
  }, { onConflict: "source_url" });
  if (error) throw error;
}

function mappingFields(record) {
  const barangay = record.location?.barangay || null;
  const municipality = record.location?.municipality || null;
  const precision = record.geocode_precision || null;
  const hasCoordinates = Number.isFinite(record.lat) && Number.isFinite(record.lon);
  let mappingStatus = "needs_review";
  if (barangay && ["barangay", "road", "barangay_master"].includes(precision) && hasCoordinates) {
    mappingStatus = precision === "barangay_master" ? "matched_barangay" : "exact_geocode";
  } else if (barangay) {
    mappingStatus = "unmatched_location";
  } else if (municipality && hasCoordinates) {
    mappingStatus = "partial_match";
  }
  return {
    raw_location_text: record.location_text || record.display_name || null,
    extracted_barangay: barangay,
    extracted_municipality: municipality,
    extracted_province: record.location?.province || "Isabela",
    purok_sitio: record.location?.purokSitio || null,
    geocode_precision: precision,
    match_confidence: Number(record.geocode_confidence || 0),
    mapping_status: mappingStatus,
    location_confidence: record.location_confidence || record.location?.confidence || {},
  };
}

function legacyLocationFields(record, runId) {
  return {
    run_id: runId,
    location_text: record.location_text,
    display_name: record.display_name,
    latitude: Number.isFinite(record.lat) ? record.lat : null,
    longitude: Number.isFinite(record.lon) ? record.lon : null,
    raw_payload: record,
    ...mappingFields(record),
  };
}

function legacyQualityFields(record) {
  const autoReview = autoReviewDecision(record);
  const now = new Date().toISOString();
  return {
    classification_confidence: record.classification_confidence || null,
    classification_score: record.classification_score || 0,
    classification_reason: record.classification_reason || null,
    article_content_hash: record.article_content_hash || null,
    status: autoReview.accepted ? "approved" : "pending_review",
    public_visible: autoReview.accepted,
    needs_manual_review: !autoReview.accepted,
    verified_at: autoReview.accepted ? now : null,
    verified_municipality: autoReview.accepted ? record.location?.municipality || null : null,
    verified_barangay: autoReview.accepted ? record.location?.barangay || null : null,
    verified_purok_sitio: autoReview.accepted ? record.location?.purokSitio || null : null,
    verified_road_place: autoReview.accepted ? record.location?.road || null : null,
    processed_at: autoReview.accepted ? now : null,
    error_message: autoReview.accepted ? null : autoReview.reason,
    raw_payload: { ...record, auto_review: autoReview },
  };
}

async function updateLegacyIncidentRecord(client, incidentId, record, runId) {
  const { error } = await client.from("scraper_records")
    .update({
      ...legacyLocationFields(record, runId),
      ...legacyQualityFields(record),
      updated_at: new Date().toISOString(),
    })
    .eq("scraped_incident_id", incidentId)
    .is("deleted_at", null);
  if (error) throw error;
}

async function addLegacyRecord(client, incidentId, record, sourceId, runId) {
  const category = record.incident_type_key === "vehicular" ? "vehicular" : "incidents";
  const now = new Date().toISOString();
  const payload = {
    scraped_incident_id: incidentId,
    source_id: sourceId,
    run_id: runId,
    source_site: record.source_site,
    source_url: record.source_url,
    source_hash: hash(record.source_url),
    duplicate_key: record.incident_key,
    title: record.title,
    snippet: record.snippet,
    incident_type: record.incident_type_key,
    category,
    ...legacyLocationFields(record, runId),
    ...legacyQualityFields(record),
    scraped_at: now,
  };
  const { error } = await client.from("scraper_records").upsert(payload, { onConflict: "source_url" });
  if (error) throw error;
}

async function saveArticleCandidates(client, candidates = [], sourceIds = new Map(), runId = null) {
  if (!candidates.length) return { saved: 0, errors: [] };
  const errors = [];
  let saved = 0;
  for (const candidate of candidates) {
    try {
      const payload = {
        run_id: runId,
        source_id: sourceIds.get(candidate.source_site) || null,
        source_site: candidate.source_site,
        source_url: candidate.source_url,
        source_hash: hash(candidate.source_url),
        article_content_hash: candidate.article_content_hash || null,
        title: candidate.title || null,
        snippet: candidate.snippet || null,
        published_at: candidate.published_at || null,
        detected_incident_type: candidate.detected_incident_type || null,
        classification_confidence: candidate.classification_confidence || null,
        classification_score: candidate.classification_score || 0,
        classification_reason: candidate.classification_reason || null,
        matched_terms: candidate.matched_terms || [],
        rejection_reason: candidate.rejection_reason,
        rejection_details: candidate.rejection_details || null,
        raw_location_text: candidate.raw_location_text || null,
        extracted_province: candidate.location?.province || null,
        extracted_municipality: candidate.location?.municipality || null,
        extracted_barangay: candidate.location?.barangay || null,
        extracted_purok_sitio: candidate.location?.purokSitio || null,
        extracted_road: candidate.location?.road || null,
        location_confidence: candidate.location_confidence || candidate.location?.confidence || {},
        raw_payload: candidate.raw_payload || candidate,
      };
      const { error } = await client.from("scraper_article_candidates")
        .upsert(payload, { onConflict: "source_url,run_id" });
      if (error) throw error;
      saved += 1;
    } catch (error) {
      errors.push(`${candidate.source_url}: ${error.message}`);
    }
  }
  return { saved, errors };
}

async function saveSourceHealth(client, rows = [], sourceIds = new Map()) {
  const errors = [];
  for (const row of rows) {
    try {
      const sourceId = sourceIds.get(row.source_key);
      if (!sourceId) continue;
      const now = new Date().toISOString();
      const payload = {
        source_id: sourceId,
        source_key: row.source_key,
        source_name: row.source_name,
        status: row.status || "unknown",
        last_scraped_at: now,
        last_success_at: row.status === "healthy" || row.status === "warning" ? now : null,
        last_failure_at: row.status === "failed" ? now : null,
        pages_checked: row.pages_checked || 0,
        links_found: row.links_found || 0,
        articles_processed: row.articles_processed || 0,
        incidents_detected: row.incidents_detected || 0,
        rejected_count: row.rejected_count || 0,
        duplicate_count: row.duplicate_count || 0,
        failed_count: row.failed_count || 0,
        cache_hits: row.cache_hits || 0,
        retries: row.retries || 0,
        last_error: row.last_error || null,
        metadata: row,
      };
      const { error } = await client.from("scraper_source_health").upsert(payload, { onConflict: "source_id" });
      if (error) throw error;
    } catch (error) {
      errors.push(`${row.source_key || "unknown"}: ${error.message}`);
    }
  }
  return errors;
}

async function refreshExactSourceRecord(client, record, runId) {
  const sourceResult = await client.from("incident_sources")
    .select("incident_id").eq("source_url", record.source_url).maybeSingle();
  if (sourceResult.error) throw sourceResult.error;
  const incidentId = sourceResult.data?.incident_id;
  if (!incidentId) return false;

  await addIncidentSource(client, incidentId, record);
  const canonicalUpdate = incidentRow(record);
  delete canonicalUpdate.incident_key;
  const canonicalResult = await client.from("scraped_incidents").update(canonicalUpdate).eq("id", incidentId);
  if (canonicalResult.error) throw canonicalResult.error;

  await updateLegacyIncidentRecord(client, incidentId, record, runId);
  return true;
}

export async function saveScrapedRecords(records = [], { mode = "update", scrapeStats = {}, rejected = [], sourceHealth = [] } = {}) {
  if (!isSupabaseEnabled()) return { enabled: false, saved: false, newIncidents: 0, mergedIncidents: 0, duplicates: 0, message: "Supabase is not configured." };
  const client = getSupabaseAdminClient();
  let runId = null;
  let inserted = 0;
  let merged = 0;
  let duplicates = 0;
  const errors = [];
  try {
    const sourceIds = await syncSources(client);
    const runResult = await client.from("scraper_runs").insert({
      endpoint_type: "all", status: "running", fetched_count: records.length + rejected.length, metadata: { mode, rejected_count: rejected.length, source_health: sourceHealth, ...scrapeStats },
    }).select("id").single();
    if (runResult.error) throw runResult.error;
    runId = runResult.data.id;

    const candidateResult = await saveArticleCandidates(client, rejected, sourceIds, runId);
    errors.push(...candidateResult.errors);
    errors.push(...await saveSourceHealth(client, sourceHealth, sourceIds));
    const exactUrls = await findExistingSourceUrls(records.map((record) => record.source_url).filter(Boolean));
    const contentHashIncidents = await findExistingContentHashIncidents(client, records.map((record) => record.article_content_hash));

    for (const record of records) {
      try {
        if (exactUrls.has(record.source_url)) {
          if (mode === "full") await refreshExactSourceRecord(client, record, runId);
          await saveArticleCandidates(client, [{
            ...record,
            detected_incident_type: record.incident_type_key,
            classification_confidence: record.classification_confidence,
            classification_score: record.classification_score,
            classification_reason: record.classification_reason,
            matched_terms: record.matched_terms,
            article_content_hash: record.article_content_hash,
            rejection_reason: "duplicate",
            rejection_details: "Exact source URL already exists.",
            raw_location_text: record.location?.rawLocationText || record.location_text,
            raw_payload: record,
          }], sourceIds, runId);
          duplicates += 1;
          continue;
        }
        const hashIncident = record.article_content_hash ? contentHashIncidents.get(record.article_content_hash) : null;
        if (hashIncident) {
          await addIncidentSource(client, hashIncident.id, record);
          await updateLegacyIncidentRecord(client, hashIncident.id, record, runId);
          await saveArticleCandidates(client, [{
            ...record,
            detected_incident_type: record.incident_type_key,
            classification_confidence: record.classification_confidence,
            classification_score: record.classification_score,
            classification_reason: record.classification_reason,
            matched_terms: record.matched_terms,
            article_content_hash: record.article_content_hash,
            rejection_reason: "duplicate",
            rejection_details: "Matching article content hash already exists.",
            raw_location_text: record.location?.rawLocationText || record.location_text,
            raw_payload: record,
          }], sourceIds, runId);
          duplicates += 1;
          continue;
        }
        const similar = await findSimilarIncident(client, record);
        let incident;
        if (similar) {
          incident = similar;
          const updates = incidentRow(record);
          delete updates.incident_key;
          updates.title = record.title.length > (similar.title || "").length ? record.title : similar.title;
          updates.snippet = (record.snippet || "").length > (similar.snippet || "").length ? record.snippet : similar.snippet;
          updates.published_at = new Date(record.published_at) < new Date(similar.published_at) ? record.published_at : similar.published_at;
          updates.confidence_score = Math.max(similar.confidence_score || 0, similar.score, record.geocode_confidence || 0);
          if (record.geocode_status !== "success" && similar.geocode_status === "success") {
            updates.geocode_status = similar.geocode_status;
            updates.geocoded_from = similar.geocoded_from;
            updates.geocode_confidence = similar.geocode_confidence;
            updates.latitude = similar.latitude;
            updates.longitude = similar.longitude;
            updates.display_name = similar.display_name;
          }
          const update = await client.from("scraped_incidents").update(updates).eq("id", incident.id);
          if (update.error) throw update.error;
          await updateLegacyIncidentRecord(client, incident.id, record, runId);
          merged += 1;
        } else {
          const created = await client.from("scraped_incidents").upsert(incidentRow(record), { onConflict: "incident_key" }).select("id, incident_key").single();
          if (created.error) throw created.error;
          incident = created.data;
          inserted += 1;
          await addLegacyRecord(client, incident.id, record, sourceIds.get(record.source_site), runId);
        }
        await addIncidentSource(client, incident.id, record);
      } catch (error) {
        errors.push(`${record.source_url}: ${error.message}`);
      }
    }

    const status = errors.length === records.length && records.length ? "failed" : "completed";
    await client.from("scraper_runs").update({
      status,
      finished_at: new Date().toISOString(),
      inserted_count: inserted,
      matched_count: merged,
      ignored_count: duplicates,
      failed_count: errors.length,
      error_message: errors.slice(0, 10).join("\n") || null,
      metadata: {
        mode,
        ...scrapeStats,
        rejected_count: rejected.length,
        rejected_saved_count: candidateResult.saved,
        source_health: sourceHealth,
      },
    }).eq("id", runId);
    return { enabled: true, saved: status === "completed", runId, newIncidents: inserted, mergedIncidents: merged, duplicates, rejected: rejected.length + candidateResult.saved, errors };
  } catch (error) {
    if (runId) await client.from("scraper_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: error.message }).eq("id", runId);
    return { enabled: true, saved: false, newIncidents: inserted, mergedIncidents: merged, duplicates, errors: [...errors, error.message] };
  }
}

export async function saveScrapedBatch(category, records = [], options = {}) {
  const result = await saveScrapedRecords(records, options);
  return {
    ...result,
    fetchedCount: records.length,
    insertedCount: result.newIncidents,
    duplicateCount: result.duplicates,
    matchedCount: result.mergedIncidents,
  };
}
