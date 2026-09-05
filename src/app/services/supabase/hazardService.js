import { readPublicData } from './publicDataService';
import { runSupabaseRequest } from "./errors";

function hazardZoneToApp(row = {}) {
  return {
    id: row.id,
    advisoryId: row.advisory_id || null,
    label: row.name || "Hazard zone",
    name: row.name || "Hazard zone",
    type: row.zone_type || "default",
    zoneType: row.zone_type || "default",
    severity: row.severity || "moderate",
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: Number(row.radius_meters || 250) / 18,
    radiusMeters: Number(row.radius_meters || 250),
    description: row.description || "",
    publicVisible: Boolean(row.public_visible),
    source: row.source || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hazardZonePayload(zone = {}) {
  return {
    advisory_id: zone.advisoryId || zone.advisory_id || null,
    source: zone.source || "manual_admin",
    name: zone.name?.trim() || zone.label?.trim() || "Manual accident-prone area",
    zone_type: zone.zoneType || zone.zone_type || zone.type || "accident_hotspot",
    severity: zone.severity || "high",
    description: zone.description?.trim() || "",
    latitude: Number(zone.latitude ?? zone.lat),
    longitude: Number(zone.longitude ?? zone.lng),
    radius_meters: Math.min(5000, Math.max(25, Math.round(Number(zone.radiusMeters ?? zone.radius_meters) || 420))),
    public_visible: Boolean(zone.publicVisible ?? zone.public_visible),
  };
}

export async function listPublicHazardZones({ limit = 100 } = {}) {
  const rows = await readPublicData(`hazards:${limit}`, () => runSupabaseRequest(client =>
    client
      .from("hazard_zones")
      .select("id, advisory_id, source, name, zone_type, severity, latitude, longitude, radius_meters, description, public_visible, created_at, updated_at")
      .eq("public_visible", true)
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit),
  "Unable to load public hazard zones."));

  return rows.map(hazardZoneToApp);
}

export async function listAdminHazardZones({ limit = 200, zoneType, source } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client
      .from("hazard_zones")
      .select("id, advisory_id, source, name, zone_type, severity, latitude, longitude, radius_meters, description, public_visible, created_at, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (zoneType) query = query.eq("zone_type", zoneType);
    if (source) query = query.eq("source", source);
    return query;
  }, "Unable to load hazard zones.");

  return rows.map(hazardZoneToApp);
}

export function listManualAccidentHotspots(options = {}) {
  return listAdminHazardZones({ ...options, zoneType: "accident_hotspot", source: "manual_admin" });
}

export async function saveHazardZoneRecord(zone) {
  const payload = hazardZonePayload(zone);
  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    throw new Error("Pin a valid map location before saving the accident-prone area.");
  }

  const query = zone.id
    ? client => client
      .from("hazard_zones")
      .update({ ...payload, deleted_at: null })
      .eq("id", zone.id)
      .select("*")
      .single()
    : client => client
      .from("hazard_zones")
      .insert(payload)
      .select("*")
      .single();

  return runSupabaseRequest(query, "Unable to save accident-prone area.").then(hazardZoneToApp);
}

export async function archiveHazardZoneRecord(zoneId) {
  return runSupabaseRequest(client =>
    client
      .from("hazard_zones")
      .update({ deleted_at: new Date().toISOString(), public_visible: false })
      .eq("id", zoneId)
      .select("*")
      .single(),
  "Unable to remove accident-prone area.").then(hazardZoneToApp);
}

export async function archiveManualHazardZoneForAdvisory(advisoryId) {
  if (!advisoryId) return [];
  const rows = await runSupabaseRequest(client =>
    client
      .from("hazard_zones")
      .update({ deleted_at: new Date().toISOString(), public_visible: false })
      .eq("advisory_id", advisoryId)
      .eq("source", "manual_admin")
      .eq("zone_type", "accident_hotspot")
      .is("deleted_at", null)
      .select("*"),
  "Unable to remove linked accident-prone area.");
  return rows.map(hazardZoneToApp);
}
