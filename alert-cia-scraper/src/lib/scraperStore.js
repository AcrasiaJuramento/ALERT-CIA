import crypto from "node:crypto";
import { getSupabaseAdminClient, isSupabaseEnabled } from "./supabase";

function hashSource(sourceUrl = "") {
  return crypto.createHash("sha256").update(sourceUrl).digest("hex");
}

function normalize(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function duplicateKey(item = {}, category) {
  const date = item.scraped_at
    ? new Date(item.scraped_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return crypto
    .createHash("sha256")
    .update([
      category,
      normalize(item.title),
      normalize(item.location || item.display_name),
      normalize(item.incident_type),
      date,
    ].join("|"))
    .digest("hex");
}

function toDbRecord(item = {}, category, sourceId, runId) {
  return {
    source_id: sourceId,
    run_id: runId,
    source_site: item.source_site || "unknown",
    source_url: item.source_url,
    source_hash: hashSource(item.source_url),
    duplicate_key: duplicateKey(item, category),
    title: item.title || null,
    snippet: item.snippet || null,
    incident_type: item.incident_type || "unknown",
    category,
    severity: item.severity || null,
    location_text: item.location || null,
    display_name: item.display_name || null,
    latitude: Number.isFinite(item.lat) ? item.lat : null,
    longitude: Number.isFinite(item.lon) ? item.lon : null,
    raw_payload: item,
    scraped_at: new Date().toISOString(),
  };
}

async function getSource(client, sourceKey = "bombo") {
  const { data, error } = await client
    .from("scraper_sources")
    .select("*")
    .eq("source_key", sourceKey)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: inserted, error: insertError } = await client
    .from("scraper_sources")
    .insert({
      source_key: sourceKey,
      name: "Bombo Radyo News",
      base_url: "https://news.bomboradyo.com",
      search_url: "https://news.bomboradyo.com/?s=isabela",
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted;
}

export async function saveScrapedBatch(category, records = [], { sourceKey = "bombo" } = {}) {
  if (!isSupabaseEnabled()) {
    return {
      enabled: false,
      saved: false,
      message: "Supabase is not configured for the scraper.",
    };
  }

  const client = getSupabaseAdminClient();
  let run = null;

  try {
    const source = await getSource(client, sourceKey);
    const { data: runData, error: runError } = await client
      .from("scraper_runs")
      .insert({
        source_id: source.id,
        endpoint_type: category,
        status: "running",
        fetched_count: records.length,
      })
      .select("*")
      .single();

    if (runError) throw runError;
    run = runData;

    const payload = records
      .filter(item => item?.source_url)
      .map(item => toDbRecord(item, category, source.id, run.id));

    let duplicateCount = Math.max(records.length - payload.length, 0);
    let savedRows = [];
    if (payload.length) {
      const sourceUrls = payload.map((record) => record.source_url);
      const duplicateKeys = payload.map((record) => record.duplicate_key).filter(Boolean);
      const existingUrls = new Set();
      const existingKeys = new Set();

      const { data: existingByUrl, error: existingUrlError } = await client
        .from("scraper_records")
        .select("source_url")
        .in("source_url", sourceUrls)
        .is("deleted_at", null);

      if (existingUrlError) throw existingUrlError;
      (existingByUrl || []).forEach((record) => existingUrls.add(record.source_url));

      if (duplicateKeys.length) {
        const { data: existingByKey, error: existingKeyError } = await client
          .from("scraper_records")
          .select("duplicate_key")
          .in("duplicate_key", duplicateKeys)
          .is("deleted_at", null);

        if (existingKeyError) throw existingKeyError;
        (existingByKey || []).forEach((record) => existingKeys.add(record.duplicate_key));
      }

      const newPayload = payload.filter((record) => (
        !existingUrls.has(record.source_url) &&
        (!record.duplicate_key || !existingKeys.has(record.duplicate_key))
      ));
      duplicateCount += payload.length - newPayload.length;

      const { data, error } = newPayload.length
        ? await client
          .from("scraper_records")
          .insert(newPayload)
          .select("id, status, related_incident_id")
        : { data: [], error: null };

      if (error) throw error;
      savedRows = data || [];
    }

    const matchedCount = savedRows.filter(row => row.related_incident_id).length;
    const { error: completeError } = await client
      .from("scraper_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        inserted_count: savedRows.length,
        matched_count: matchedCount,
        ignored_count: duplicateCount,
      })
      .eq("id", run.id);

    if (completeError) throw completeError;

    return {
      enabled: true,
      saved: true,
      runId: run.id,
      fetchedCount: records.length,
      insertedCount: savedRows.length,
      duplicateCount,
      matchedCount,
    };
  } catch (error) {
    if (run?.id) {
      await client
        .from("scraper_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          failed_count: records.length,
          error_message: error.message,
        })
        .eq("id", run.id);
    }

    return {
      enabled: true,
      saved: false,
      error: error.message,
    };
  }
}
