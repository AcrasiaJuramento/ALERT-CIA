import { runSupabaseRequest } from "./errors";
import { supabase } from "../../lib/supabaseClient";
import {
  loadAdvisories,
  loadPublishedAdvisories,
} from "../../utils/advisoryStorage";

const priorityRank = {
  critical: 4,
  warning: 3,
  moderate: 2,
  resolved: 1,
};

function isMissingAdvisoryTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || String(error?.message || "").includes("public_advisories");
}

function isMissingAdvisoryRpc(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST202" || message.includes("save_public_advisory") || message.includes("archive_public_advisory");
}

function isMissingAdvisoryActiveFields(error) {
  return error?.code === "42703";
}

function advisoryToApp(row = {}) {
  const coordinates = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
    ? { lat: Number(row.latitude), lng: Number(row.longitude) }
    : null;

  const severity = row.priority || row.severity || "warning";
  const category = row.advisory_type || row.category || "general";

  return {
    id: row.id,
    title: row.title || "Public Advisory",
    message: row.message || "",
    severity,
    priority: severity,
    category,
    advisoryType: category,
    area: row.area || "Echague, Isabela",
    coordinates,
    status: row.status || "draft",
    startsAt: row.starts_at || row.created_at,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function advisoryPayload(advisory = {}) {
  const severity = advisory.priority || advisory.severity || "warning";
  const category = advisory.advisoryType || advisory.category || "general";

  return {
    title: advisory.title?.trim() || "Public Advisory",
    message: advisory.message?.trim() || "",
    severity,
    priority: severity,
    category,
    advisory_type: category,
    area: advisory.area?.trim() || "Echague, Isabela",
    latitude: Number.isFinite(Number(advisory.coordinates?.lat)) ? Number(advisory.coordinates.lat) : null,
    longitude: Number.isFinite(Number(advisory.coordinates?.lng)) ? Number(advisory.coordinates.lng) : null,
    status: advisory.status || "draft",
    starts_at: toIsoOrNull(advisory.startsAt) || new Date().toISOString(),
    expires_at: toIsoOrNull(advisory.expiresAt),
  };
}

function sortAdvisories(advisories = []) {
  return advisories.sort((first, second) => {
    const priorityDifference = (priorityRank[second.severity] || 0) - (priorityRank[first.severity] || 0);
    if (priorityDifference) return priorityDifference;
    return new Date(second.createdAt || second.updatedAt || 0) - new Date(first.createdAt || first.updatedAt || 0);
  });
}

export async function listAdvisories({ activeOnly = false, publishedOnly = false, limit = 100 } = {}) {
  try {
    const now = new Date().toISOString();
    const rows = await runSupabaseRequest(client => {
      let query = client
        .from("public_advisories")
        .select("*")
        .is("deleted_at", null)
        .order("priority", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (publishedOnly) query = query.eq("status", "published");
      if (activeOnly) {
        query = query
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`expires_at.is.null,expires_at.gt.${now}`);
      }
      return query;
    }, "Unable to load public advisories.");

    return sortAdvisories(rows.map(advisoryToApp));
  } catch (error) {
    if (isMissingAdvisoryActiveFields(error)) {
      return listLegacyAdvisories({ publishedOnly, limit });
    }
    if (!isMissingAdvisoryTable(error)) throw error;
    return sortAdvisories(publishedOnly ? loadPublishedAdvisories() : loadAdvisories()).slice(0, limit);
  }
}

async function listLegacyAdvisories({ publishedOnly = false, limit = 100 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("public_advisories")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (publishedOnly) query = query.eq("status", "published");
    return query;
  }, "Unable to load public advisories.");

  return sortAdvisories(rows.map(advisoryToApp));
}

export async function listPublishedAdvisories(options = {}) {
  return listAdvisories({ ...options, activeOnly: true, publishedOnly: true });
}

export async function saveAdvisoryRecord(advisory) {
  const payload = advisoryPayload(advisory);
  const {
    advisory_type: _advisoryType,
    priority: _priority,
    starts_at: _startsAt,
    expires_at: _expiresAt,
    ...legacyPayload
  } = payload;
  const rpcPayload = {
    target_id: advisory.id || null,
    target_title: payload.title,
    target_message: payload.message,
    target_severity: payload.severity,
    target_category: payload.category,
    target_area: payload.area,
    target_latitude: payload.latitude,
    target_longitude: payload.longitude,
    target_status: payload.status,
    target_starts_at: payload.starts_at,
    target_expires_at: payload.expires_at,
  };

  const directQuery = advisory.id
    ? client => client
      .from("public_advisories")
      .update(payload)
      .eq("id", advisory.id)
      .select("*")
      .single()
    : client => client
      .from("public_advisories")
      .insert(payload)
      .select("*")
      .single();
  const legacyDirectQuery = advisory.id
    ? client => client
      .from("public_advisories")
      .update(legacyPayload)
      .eq("id", advisory.id)
      .select("*")
      .single()
    : client => client
      .from("public_advisories")
      .insert(legacyPayload)
      .select("*")
      .single();

  try {
    return await runSupabaseRequest(
      client => client.rpc("save_public_advisory", rpcPayload),
      "Unable to save public advisory.",
    ).then(advisoryToApp);
  } catch (error) {
    if (isMissingAdvisoryTable(error)) {
      throw new Error("The public_advisories table is missing in Supabase. Apply migration 26_public_advisories before saving advisories.");
    }
    if (isMissingAdvisoryRpc(error)) {
      try {
        return await runSupabaseRequest(directQuery, "Unable to save public advisory.").then(advisoryToApp);
      } catch (directError) {
        if (isMissingAdvisoryActiveFields(directError)) {
          return await runSupabaseRequest(legacyDirectQuery, "Unable to save public advisory.").then(advisoryToApp);
        }
        throw directError;
      }
    }
    throw error;
  }
}

export function subscribeToPublicAdvisories(onChange) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel("public-advisories-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "public_advisories" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function archiveAdvisoryRecord(advisoryId) {
  try {
    return await runSupabaseRequest(
      client => client.rpc("archive_public_advisory", { target_id: advisoryId }),
      "Unable to remove public advisory.",
    ).then(advisoryToApp);
  } catch (error) {
    if (isMissingAdvisoryTable(error)) {
      throw new Error("The public_advisories table is missing in Supabase. Apply migration 26_public_advisories before removing advisories.");
    }
    if (isMissingAdvisoryRpc(error)) {
      return await runSupabaseRequest(client =>
        client
          .from("public_advisories")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", advisoryId)
          .select("*")
          .single(),
      "Unable to remove public advisory.").then(advisoryToApp);
    }
    throw error;
  }
}
