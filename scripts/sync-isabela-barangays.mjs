import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pointOnFeature from "@turf/point-on-feature";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    return match ? [[match[1].trim(), match[2].trim().replace(/^["']|["']$/g, "")]] : [];
  }));
}

function normalize(value = "") {
  return String(value).toLowerCase()
    .replace(/\bgeneral\b/g, "gen")
    .replace(/\bsanta\b/g, "sta")
    .replace(/\bsanto\b/g, "sto")
    .replace(/\b(?:barangay|brgy|bgy|baryo|poblacion)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function municipalityName(value = "") {
  return String(value).replace(/\s+City$/i, "").trim();
}

async function allBarangays(client) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("barangays")
      .select("id, psgc_code, name, normalized_name, municipality").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

const env = { ...readEnv(path.join(root, ".env")), ...process.env };
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const collection = JSON.parse(fs.readFileSync(path.join(root, "src/app/data/Isabela.geojson"), "utf8"));
const client = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const dryRun = process.argv.includes("--dry-run");
const existing = dryRun ? [] : await allBarangays(client);
const byLocation = new Map(existing.map((row) => [
  `${normalize(row.municipality)}|${normalize(row.name)}`,
  row,
]));
const byPsgcCode = new Map(existing.filter((row) => row.psgc_code).map((row) => [row.psgc_code, row]));

const payload = collection.features.map((feature) => {
  const properties = feature.properties || {};
  const municipality = municipalityName(properties.NAME_2);
  const name = properties.NAME_3;
  const current = byPsgcCode.get(properties.GID_3) || byLocation.get(`${normalize(municipality)}|${normalize(name)}`);
  const [longitude, latitude] = pointOnFeature(feature).geometry.coordinates;
  return {
    id: current?.id || crypto.randomUUID(),
    psgc_code: properties.GID_3,
    name,
    normalized_name: normalize(name),
    municipality,
    province: properties.NAME_1 || "Isabela",
    boundary: feature.geometry,
    centroid: `POINT(${longitude} ${latitude})`,
    source_name: "GADM 4.1 / Isabela.geojson",
    source_url: "local:src/app/data/Isabela.geojson",
    active: true,
    metadata: {
      gid_2: properties.GID_2,
      gid_3: properties.GID_3,
      alternate_name: properties.VARNAME_3 === "NA" ? null : properties.VARNAME_3,
    },
  };
});

if (dryRun) {
  console.log(`Validated ${payload.length} Isabela barangay boundaries; no database writes performed.`);
  process.exit(0);
}

for (let index = 0; index < payload.length; index += 100) {
  const batch = payload.slice(index, index + 100);
  const { error } = await client.from("barangays").upsert(batch, { onConflict: "id" });
  if (error) throw new Error(`Barangay batch ${index / 100 + 1} failed: ${error.message}`);
  console.log(`Synced ${Math.min(index + batch.length, payload.length)}/${payload.length} barangays`);
}

console.log(`Completed Isabela barangay sync (${payload.length} boundaries).`);
