const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_IDENTIFIER_VALUES = new Set(["", "undefined", "null", "nan"]);

export function normalizeRecordIdentifier(value) {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  return EMPTY_IDENTIFIER_VALUES.has(normalized.toLowerCase()) ? "" : normalized;
}

export function firstRecordIdentifier(...values) {
  for (const value of values) {
    const normalized = normalizeRecordIdentifier(value);
    if (normalized) return normalized;
  }
  return "";
}

export function isUuidIdentifier(value) {
  return UUID_PATTERN.test(normalizeRecordIdentifier(value));
}

export function randomUuid() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
