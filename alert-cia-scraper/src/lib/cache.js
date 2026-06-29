import fs from "fs";
import path from "path";

const runtimeEnv = globalThis.process?.env || {};
const cwd = globalThis.process?.cwd?.() || ".";
const isServerless = Boolean(runtimeEnv.VERCEL || runtimeEnv.AWS_LAMBDA_FUNCTION_NAME);
const CACHE_DIR = isServerless
  ? path.join("/tmp", "alert-cia-cache")
  : path.join(cwd, "src/cache");

const INCIDENTS_FILE = path.join(CACHE_DIR, "incidents.json");
const VEHICULAR_FILE = path.join(CACHE_DIR, "vehicular.json");

const META_FILE = path.join(CACHE_DIR, "meta.json");

const TTL = 1000 * 60 * 10; // 10 minutes
const MAX_RECORDS_PER_CACHE = 1000;

function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function safeWriteJSON(file, data) {
  try {
    writeJSON(file, data);
    return true;
  } catch (error) {
    console.warn("[alert-cia-scraper] cache write skipped:", error.message);
    return false;
  }
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

function mergeRecords(existing = [], incoming = []) {
  const records = new Map();
  [...existing, ...incoming].forEach((record) => {
    const key = record?.incident_key || record?.id || record?.source_url ||
      `${record?.incident_type || "unknown"}|${record?.title || "untitled"}|${record?.published_at || ""}`;
    records.set(key, record);
  });
  return [...records.values()]
    .sort((left, right) => new Date(right.published_at || right.scraped_at || 0) - new Date(left.published_at || left.scraped_at || 0))
    .slice(0, MAX_RECORDS_PER_CACHE);
}

export function saveCache({ incidents, vehicular } = {}, { replace = false } = {}) {
  if (incidents !== undefined) {
    const existing = replace ? [] : readJSON(INCIDENTS_FILE) || [];
    safeWriteJSON(INCIDENTS_FILE, mergeRecords(existing, incidents));
  }

  if (vehicular !== undefined) {
    const existing = replace ? [] : readJSON(VEHICULAR_FILE) || [];
    safeWriteJSON(VEHICULAR_FILE, mergeRecords(existing, vehicular));
  }

  safeWriteJSON(META_FILE, {
    timestamp: Date.now(),
    incidents_count: (readJSON(INCIDENTS_FILE) || []).length,
    vehicular_count: (readJSON(VEHICULAR_FILE) || []).length,
  });
}
