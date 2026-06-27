import crypto from "node:crypto";
import { SOURCES } from "../constants/sources";
import { similarityScore } from "./deduplication";
import { getSupabaseAdminClient, isSupabaseEnabled } from "./supabase";

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
  const payload = SOURCES.map((source) => ({
    source_key: source.key,
    name: source.name,
    base_url: source.baseUrl,
    search_url: source.firstPageUrl,
    active: source.enabled,
    metadata: {
      pagination_type: source.paginationType,
      max_pages_full: source.maxPagesFull,
      max_pages_update: source.maxPagesUpdate,
      allowed_domains: source.allowedDomains,
    },
  }));
  const { data, error } = await client.from("scraper_sources").upsert(payload, { onConflict: "source_key" }).select("id, source_key");
  if (error) throw error;
  return new Map(data.map((row) => [row.source_key, row.id]));
}

function incidentRow(record) {
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
    geocoded_from: record.geocoded_from,
    geocode_status: record.geocode_status,
    geocode_confidence: record.geocode_confidence,
    latitude: record.lat,
    longitude: record.lon,
    display_name: record.display_name,
    published_at: record.published_at,
    last_seen_at: new Date().toISOString(),
    confidence_score: record.geocode_confidence || 0.5,
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
  }, { onConflict: "source_url", ignoreDuplicates: true });
  if (error) throw error;
}

async function addLegacyRecord(client, incidentId, record, sourceId, runId) {
  const category = record.incident_type_key === "vehicular" ? "vehicular" : "incidents";
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
    location_text: record.location_text,
    display_name: record.display_name,
    latitude: record.lat,
    longitude: record.lon,
    raw_payload: record,
    scraped_at: new Date().toISOString(),
  };
  const { error } = await client.from("scraper_records").upsert(payload, { onConflict: "source_url", ignoreDuplicates: true });
  if (error) throw error;
}

export async function saveScrapedRecords(records = [], { mode = "update", scrapeStats = {} } = {}) {
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
      endpoint_type: "all", status: "running", fetched_count: records.length, metadata: { mode, ...scrapeStats },
    }).select("id").single();
    if (runResult.error) throw runResult.error;
    runId = runResult.data.id;

    for (const record of records) {
      try {
        const exact = await findExistingSourceUrls([record.source_url]);
        if (exact.has(record.source_url)) { duplicates += 1; continue; }
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
    }).eq("id", runId);
    return { enabled: true, saved: status === "completed", runId, newIncidents: inserted, mergedIncidents: merged, duplicates, errors };
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
