import { runSupabaseRequest } from "./errors";

function hazardZoneToApp(row = {}) {
  return {
    id: row.id,
    label: row.name || "Hazard zone",
    type: row.zone_type || "default",
    severity: row.severity || "moderate",
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: Number(row.radius_meters || 250) / 18,
    radiusMeters: Number(row.radius_meters || 250),
    description: row.description || "",
    publicVisible: Boolean(row.public_visible),
    updatedAt: row.updated_at,
  };
}

export async function listPublicHazardZones({ limit = 100 } = {}) {
  const rows = await runSupabaseRequest(client =>
    client
      .from("hazard_zones")
      .select("*")
      .eq("public_visible", true)
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit),
  "Unable to load public hazard zones.");

  return rows.map(hazardZoneToApp);
}
