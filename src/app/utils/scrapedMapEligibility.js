import { isRoadAccidentReport } from "../../../alert-cia-scraper/src/lib/roadAccidents.js";

export const REVIEWED_SCRAPER_MAP_STATUSES = ["approved", "promoted", "matched", "imported"];

export function isAccidentMapRow(row = {}) {
  const values = [
    row.category,
    row.incident_type,
    // row.incident_type_key,
    row.title,
    row.snippet,
    row.location_text,
  ].map(value => String(value || "").toLowerCase());

  return isRoadAccidentReport(values.join(". ")) || values.some(value => (
    value === "vehicular" ||
    value.includes("accident") ||
    value.includes("vehicular") ||
    value.includes("vehicle") ||
    value.includes("collision") ||
    value.includes("crash") ||
    value.includes("bangga") ||
    value.includes("aksidente")
  ));
}

