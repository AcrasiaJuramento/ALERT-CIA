const geoCache = new Map();

/* ---------------- GEO CODE ---------------- */

export async function geocode(query) {
  const key = query.toLowerCase();

  if (geoCache.has(key)) {
    return geoCache.get(key);
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=` +
      encodeURIComponent(query);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "AlertCIA/1.0 (contact: alertcia)",
        "Accept": "application/json",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();

    if (!data.length) {
      geoCache.set(key, null);
      return null;
    }

    const result = {
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
      display_name: data[0].display_name,
    };

    geoCache.set(key, result);
    return result;
  } catch (err) {
    console.error("GEOCODE ERROR:", err);
    return null;
  }
}

/* ---------------- VALIDATION ---------------- */

export function isValidLocation(location) {
  if (!location) return false;

  const badPatterns = [
    /filed|stolen|dies|injured|accident|collision|probe|report/i,
  ];

  if (badPatterns.some((p) => p.test(location))) return false;

  const hasGeoSignal =
    /(Ilagan|Santiago|Cauayan|Jones|San Mateo|Tumauini|Alicia|Roxas|Echague|Cabatuan|Ramon)/i.test(
      location
    );

  return hasGeoSignal;
}

/* ---------------- CLEAN QUERY ---------------- */

export function cleanGeocodeQuery(location) {
  return location
    .replace(/barangay\s+/i, "")
    .replace(/brgy\.?\s*/i, "")
    .replace(/purok\s*\d*/i, "")
    .replace(/sitio\s*/i, "")
    .replace(/philippines/i, "")
    .replace(/,+/g, ",")
    .replace(/,\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- FINAL SANITIZER ---------------- */

function sanitizeFinalLocation(loc) {
  if (!loc) return null;

  const bad = /stolen|filed|dies|injured|accident|collision|probe|report/i;
  if (bad.test(loc)) return null;

  return loc;
}

/* ---------------- EXTRACTION ---------------- */

export function extractLocation(text) {
  if (!text) return null;

  const clean = text.replace(/\s+/g, " ");
  const lower = clean.toLowerCase();

  let barangay = null;
  let municipality = null;

  /* ---------------- BARANGAY ---------------- */
  const brgyMatch = clean.match(
    /\b(?:Brgy\.?|Barangay)\s+([A-Za-z0-9\s\-]{2,50})/i
  );

  if (brgyMatch) {
    const name = brgyMatch[1].trim();
    if (!name.toLowerCase().includes("isabela")) {
      barangay = name;
    }
  }

  const knownBarangays = ["Malasin"];

  for (const b of knownBarangays) {
    if (lower.includes(b.toLowerCase())) {
      barangay = b;
      break;
    }
  }

  /* ---------------- MUNICIPALITY ---------------- */
  const towns = [
    "Ilagan","Santiago","Cauayan","Jones","San Mateo",
    "Tumauini","Alicia","Roxas","Echague","Cabatuan",
    "Ramon","Naguilian","San Mariano","Delfin Albano",
    "Maconacon","Palanan","Dinapigue","Cabagan","Reina Mercedes"
  ];

  for (const t of towns) {
    if (lower.includes(t.toLowerCase())) {
      municipality = t;
      break;
    }
  }

  /* ---------------- STRICT RULE ---------------- */
  // MUST have municipality or reject
  if (!municipality) return null;

  const parts = [];

  if (barangay) {
    parts.push(`Barangay ${barangay}`);
  }

  parts.push(`${municipality}, Isabela`);

  let result = parts.join(", ") + ", Philippines";

  return sanitizeFinalLocation(result);
}