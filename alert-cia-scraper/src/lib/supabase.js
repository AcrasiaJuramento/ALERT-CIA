import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .reduce((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return values;

      const separator = trimmed.indexOf("=");
      if (separator < 1) return values;

      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      values[key] = rawValue.replace(/^["']|["']$/g, "");
      return values;
    }, {});
}

function getRootEnvFallback(key) {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ];

  for (const filePath of candidates) {
    const value = readEnvFile(filePath)[key];
    if (value) return value;
  }

  return "";
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  getRootEnvFallback("NEXT_PUBLIC_SUPABASE_URL") ||
  getRootEnvFallback("VITE_SUPABASE_URL");
const supabasePublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  getRootEnvFallback("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  getRootEnvFallback("VITE_SUPABASE_ANON_KEY");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || getRootEnvFallback("SUPABASE_SERVICE_ROLE_KEY");

console.log("Supabase URL exists:", Boolean(supabaseUrl));
console.log("Service key exists:", Boolean(serviceRoleKey));
console.log("Service key prefix:", serviceRoleKey?.slice(0, 10) || null);
console.log("NEXT_PUBLIC_SUPABASE_URL exists:", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL));

let client = null;

export function isSupabaseEnabled() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export function getSupabaseUrl() {
  return supabaseUrl;
}

export function getSupabasePublishableKey() {
  return supabasePublishableKey;
}

export function getSupabaseAdminClient() {
  if (!isSupabaseEnabled()) {
    throw new Error("Supabase scraper connection is not configured.");
  }

  if (!client) {
    client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          "x-client-info": "alert-cia-scraper",
        },
      },
    });
  }

  return client;
}
