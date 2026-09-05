import { subscribeToPublicAdvisoryChanges } from './publicRealtime';
import { getSupabaseClient } from "../../lib/supabaseClient";
import { randomUuid } from "../../utils/uuid";
import { runSupabaseRequest } from "./errors";
import {
  loadAdvisories,
  loadPublishedAdvisories,
} from "../../utils/advisoryStorage";

export const ADVISORY_MEDIA_BUCKET = "public-advisory-media";

const priorityRank = {
  critical: 4,
  warning: 3,
  moderate: 2,
  resolved: 1,
};

function isMissingAdvisoryTable(error) {
  const message = String(error?.message || "");
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /relation ["']?public(?:\.)?public_advisories["']? does not exist/i.test(message)
    || /could not find the table ["']?public_advisories["']?/i.test(message);
}

function isMissingAdvisoryRpc(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST202" || message.includes("save_public_advisory") || message.includes("archive_public_advisory");
}

function isMissingAdvisoryActiveFields(error) {
  return error?.code === "42703";
}

function isMissingAdvisoryMediaTable(error) {
  const message = String(error?.message || "");
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("public_advisory_media");
}

function getPublicAdvisoryMediaUrl(storagePath = "") {
  if (!storagePath) return "";
  try {
    return getSupabaseClient().storage.from(ADVISORY_MEDIA_BUCKET).getPublicUrl(storagePath).data?.publicUrl || "";
  } catch {
    return "";
  }
}

function mediaToApp(row = {}) {
  return {
    id: row.id,
    advisoryId: row.advisory_id,
    storagePath: row.storage_path || "",
    fileName: row.file_name || "Advisory image",
    name: row.file_name || "Advisory image",
    mimeType: row.mime_type || "image/jpeg",
    type: row.mime_type || "image/jpeg",
    sizeBytes: Number(row.size_bytes || 0),
    width: row.width || null,
    height: row.height || null,
    createdAt: row.created_at,
    publicUrl: getPublicAdvisoryMediaUrl(row.storage_path),
  };
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
    media: Array.isArray(row.media) ? row.media.map(mediaToApp) : [],
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

async function attachAdvisoryMedia(advisories = []) {
  const ids = advisories.map(item => item.id).filter(Boolean);
  if (!ids.length) return advisories;

  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("public_advisory_media")
        .select("id, advisory_id, storage_path, file_name, mime_type, size_bytes, width, height, created_at")
        .in("advisory_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    "Unable to load advisory media.");
    const mediaByAdvisory = new Map();
    rows.map(mediaToApp).forEach((media) => {
      const list = mediaByAdvisory.get(media.advisoryId) || [];
      list.push(media);
      mediaByAdvisory.set(media.advisoryId, list);
    });
    return advisories.map(advisory => ({ ...advisory, media: mediaByAdvisory.get(advisory.id) || [] }));
  } catch (error) {
    if (isMissingAdvisoryMediaTable(error)) return advisories;
    throw error;
  }
}

export async function listAdvisories({ activeOnly = false, publishedOnly = false, limit = 100 } = {}) {
  try {
    const now = new Date().toISOString();
    const rows = await runSupabaseRequest(client => {
      let query = client
        .from("public_advisories")
        .select(publishedOnly ? "id, title, message, severity, category, area, latitude, longitude, status, priority, advisory_type, starts_at, expires_at, created_at, updated_at" : "*")
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

    return attachAdvisoryMedia(sortAdvisories(rows.map(advisoryToApp)));
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
      .select(publishedOnly ? "id, title, message, severity, category, area, latitude, longitude, status, created_at, updated_at" : "*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (publishedOnly) query = query.eq("status", "published");
    return query;
  }, "Unable to load public advisories.");

  return attachAdvisoryMedia(sortAdvisories(rows.map(advisoryToApp)));
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

export const subscribeToPublicAdvisories = subscribeToPublicAdvisoryChanges;

export async function uploadAdvisoryImage(advisoryId, image) {
  if (!advisoryId || !image?.blob) throw new Error("Save the advisory before uploading an image.");
  const fileExtension = image.mimeType === "image/png" ? "png" : "jpg";
  const storagePath = `${advisoryId}/${randomUuid()}.${fileExtension}`;
  const { error } = await getSupabaseClient()
    .storage
    .from(ADVISORY_MEDIA_BUCKET)
    .upload(storagePath, image.blob, {
      cacheControl: "604800",
      contentType: image.mimeType,
      upsert: false,
    });
  if (error) throw new Error(error.message || "Unable to upload advisory image.");

  return {
    storagePath,
    fileName: image.fileName || `advisory.${fileExtension}`,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes || image.blob.size || 0,
    width: image.width || null,
    height: image.height || null,
  };
}

export async function listAdvisoryMedia(advisoryId) {
  if (!advisoryId) return [];
  try {
    const rows = await runSupabaseRequest(client =>
      client
        .from("public_advisory_media")
        .select("id, advisory_id, storage_path, file_name, mime_type, size_bytes, width, height, created_at")
        .eq("advisory_id", advisoryId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    "Unable to load advisory media.");
    return rows.map(mediaToApp);
  } catch (error) {
    if (isMissingAdvisoryMediaTable(error)) return [];
    throw error;
  }
}

export async function replaceAdvisoryMedia(advisoryId, image = null) {
  if (!advisoryId) return [];
  const existing = await listAdvisoryMedia(advisoryId);
  let uploaded = null;
  if (image?.blob) uploaded = await uploadAdvisoryImage(advisoryId, image);

  let replacement = [];
  if (uploaded) {
    const row = await runSupabaseRequest(client =>
      client
        .from("public_advisory_media")
        .insert({
          advisory_id: advisoryId,
          storage_path: uploaded.storagePath,
          file_name: uploaded.fileName,
          mime_type: uploaded.mimeType,
          size_bytes: uploaded.sizeBytes,
          width: uploaded.width,
          height: uploaded.height,
        })
        .select("*")
        .single(),
    "Unable to save advisory media.");
    replacement = [mediaToApp(row)];
  }

  const existingIds = existing.map(item => item.id).filter(Boolean);
  if (existingIds.length) {
    await runSupabaseRequest(client =>
      client
        .from("public_advisory_media")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", existingIds),
    "Unable to replace advisory media.");
  }

  const removablePaths = existing.map(item => item.storagePath).filter(Boolean);
  if (removablePaths.length) {
    await getSupabaseClient().storage.from(ADVISORY_MEDIA_BUCKET).remove(removablePaths);
  }

  return replacement;
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
