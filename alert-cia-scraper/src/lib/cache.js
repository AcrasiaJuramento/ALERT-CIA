import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "src/cache");

const INCIDENTS_FILE = path.join(CACHE_DIR, "incidents.json");
const VEHICULAR_FILE = path.join(CACHE_DIR, "vehicular.json");

const META_FILE = path.join(CACHE_DIR, "meta.json");

const TTL = 1000 * 60 * 10; // 10 minutes

function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isExpired(meta) {
  if (!meta?.timestamp) return true;
  return Date.now() - meta.timestamp > TTL;
}

export function getCachedData() {
  const meta = readJSON(META_FILE);

  if (isExpired(meta)) {
    return null;
  }

  return {
    incidents: readJSON(INCIDENTS_FILE) || [],
    vehicular: readJSON(VEHICULAR_FILE) || [],
  };
}

export function saveCache({ incidents, vehicular } = {}) {
  if (incidents !== undefined) {
    writeJSON(INCIDENTS_FILE, incidents);
  }

  if (vehicular !== undefined) {
    writeJSON(VEHICULAR_FILE, vehicular);
  }

  writeJSON(META_FILE, {
    timestamp: Date.now(),
  });
}