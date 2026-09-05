import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAccidentProneAreas,
  calculateNewsCautionAreas,
  calculateOfficialAccidentProneAreas,
  classifyRecommendedRisk,
  getCanonicalIncidentKey,
  readIncidentDate,
  recencyWeightForIncident,
} from "./accidentProneAreas.js";

const REFERENCE_DATE = new Date("2026-08-28T00:00:00.000Z");

const baseRecord = {
  classification: "mvc",
  status: "verified",
  barangay: "San Fabian",
  municipality: "Echague",
  lat: 16.705,
  lng: 121.665,
  locationPrecision: "exact",
  locationAccuracy: "near_exact",
};

function record(id, overrides = {}) {
  return {
    ...baseRecord,
    id,
    incidentDate: "2026-08-01",
    time: "08:00",
    severity: "moderate",
    ...overrides,
  };
}

test("uses verified relationships for canonical incident identity", () => {
  assert.equal(getCanonicalIncidentKey(record("dispatch-a", { incidentId: "INC-1", responseId: "DSP-1", sourceKind: "mdrrmo" })), "official_incident:INC-1");
  assert.equal(getCanonicalIncidentKey(record("scrape-a", { relatedIncidentId: "INC-1", sourceKind: "reviewed_scraped", scraperStatus: "approved" })), "record:scrape-a");
  assert.equal(getCanonicalIncidentKey(record("scrape-b", { scraped_incident_id: "SCRAPED-1", sourceKind: "reviewed_scraped", scraperStatus: "approved" })), "scraped_incident:SCRAPED-1");
  assert.equal(getCanonicalIncidentKey(record("raw-only")), "record:raw-only");
});

test("does not fuzzy-merge separate crashes that share date and barangay", () => {
  const areas = calculateAccidentProneAreas([
    record("a", { title: "Motorcycle crash in San Fabian" }),
    record("b", { title: "Motorcycle crash in San Fabian" }),
  ]);

  assert.equal(areas[0].unique_incident_count, 2);
});

test("counts linked official dispatch and PCR once without adding linked scraped news", () => {
  const records = [
    record("dispatch", { incidentId: "INC-77", responseId: "DSP-1", sourceKind: "mdrrmo" }),
    record("pcr", { incident_id: "INC-77", pcrId: "PCR-1", sourceKind: "mdrrmo" }),
    record("news", { relatedIncidentId: "INC-77", sourceKind: "reviewed_scraped", scraperStatus: "approved", publicVisible: true }),
  ];
  const officialAreas = calculateOfficialAccidentProneAreas(records);
  const combinedAreas = calculateAccidentProneAreas(records);

  assert.equal(officialAreas[0].unique_incident_count, 1);
  assert.equal(officialAreas[0].total_incidents, 1);
  assert.equal(officialAreas[0].web_scraped_verified_count, 0);
  assert.equal(combinedAreas[0].unique_incident_count, 2);
  assert.equal("legacy_risk_level" in officialAreas[0], false);
  assert.equal("total_risk_score" in officialAreas[0], false);
});

test("separates official accident-prone areas from news caution areas", () => {
  const records = [
    record("pcr-a", { pcrId: "PCR-A", sourceKind: "pcr_report", severity: "critical" }),
    record("dispatch-b", { responseId: "DSP-B", sourceKind: "response", severity: "high" }),
    record("news-c", { sourceKind: "reviewed_scraped", scraperStatus: "approved", publicVisible: true, severity: "critical" }),
    record("news-d", { sourceKind: "reviewed_scraped", scraperStatus: "approved", publicVisible: true, severity: "high" }),
  ];

  const officialAreas = calculateOfficialAccidentProneAreas(records);
  const cautionAreas = calculateNewsCautionAreas(records);

  assert.equal(officialAreas[0].zone_type, "official_accident_prone");
  assert.equal(officialAreas[0].unique_incident_count, 2);
  assert.equal(officialAreas[0].web_scraped_verified_count, 0);
  assert.equal(cautionAreas[0].zone_type, "news_caution_area");
  assert.equal(cautionAreas[0].unique_incident_count, 2);
  assert.equal(cautionAreas[0].mdrrmo_incident_count, 0);
});

test("allows verified news caution areas to be public before they become high risk", () => {
  const areas = calculateNewsCautionAreas([
    record("news-only", {
      sourceKind: "promoted_scraped",
      publicVisible: true,
      severity: "moderate",
      title: "Vehicular accident in Harana",
    }),
  ], { publicOnly: true });

  assert.equal(areas.length, 1);
  assert.equal(areas[0].zone_type, "news_caution_area");
  assert.equal(areas[0].risk_level, "Caution");
});

test("optimized public scraper projections remain eligible without incident_type_key", () => {
  const areas = calculateNewsCautionAreas([
    record("public-scraper-projection", {
      sourceKind: "reviewed_scraped",
      publicVisible: true,
      scraperStatus: "approved",
      classification: undefined,
      category: "vehicular",
      incident_type: "vehicular",
      incident_type_key: undefined,
      severity: "yellow",
      title: "Vehicular accident in San Fabian",
    }),
  ], { publicOnly: true });

  assert.equal(areas.length, 1);
  assert.equal(areas[0].zone_type, "news_caution_area");
  assert.equal(areas[0].most_common_incident_type, "Vehicular");
  assert.equal(areas[0].severity_counts.moderate, 1);
});

test("lets the public map opt in to moderate official accident-prone areas", () => {
  const records = [
    record("pcr-a", { pcrId: "PCR-A", sourceKind: "pcr_report", severity: "critical" }),
    record("pcr-b", { pcrId: "PCR-B", sourceKind: "pcr_report", severity: "high" }),
  ];

  const defaultPublicAreas = calculateOfficialAccidentProneAreas(records, { publicOnly: true });
  const moderatePublicAreas = calculateOfficialAccidentProneAreas(records, {
    publicOnly: true,
    publicMinimumOfficialRiskLevel: "Moderate",
  });

  assert.equal(defaultPublicAreas.length, 0);
  assert.equal(moderatePublicAreas.length, 1);
  assert.equal(moderatePublicAreas[0].risk_level, "Moderate");
  assert.equal(moderatePublicAreas[0].is_public_visible, true);
  assert.deepEqual(moderatePublicAreas[0].records, []);
});

test("public official incident projections count toward accident-prone areas without response ids", () => {
  const records = [
    record("official-public-a", { sourceKind: "official", responseId: undefined, pcrId: undefined, severity: "high" }),
    record("official-public-b", { sourceKind: "official", responseId: undefined, pcrId: undefined, severity: "high" }),
    record("official-public-c", { sourceKind: "official", responseId: undefined, pcrId: undefined, severity: "high" }),
  ];

  const areas = calculateOfficialAccidentProneAreas(records, {
    publicOnly: true,
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(areas.length, 1);
  assert.equal(areas[0].zone_type, "official_accident_prone");
  assert.equal(areas[0].risk_level, "High");
  assert.equal(areas[0].unique_incident_count, 3);
  assert.equal(areas[0].mdrrmo_incident_count, 3);
  assert.deepEqual(areas[0].records, []);
});

test("clusters unnamed official coordinate pins into public accident-prone areas", () => {
  const records = [
    record("pcr-pin-a", {
      pcrId: "PCR-PIN-A",
      sourceKind: "pcr_report",
      barangay: null,
      location: "16.695935, 121.624844",
      lat: 16.6959349,
      lng: 121.6248436,
      severity: "high",
      locationPrecision: "official_incident_pin",
      coordinateSource: "official_incident_pin",
      mappingStatus: "exact_geocode",
      locationConfidence: { level: "high", accuracy: "near_exact", source: "official_incident_pin" },
    }),
    record("pcr-pin-b", {
      pcrId: "PCR-PIN-B",
      sourceKind: "pcr_report",
      barangay: null,
      location: "16.696231, 121.625304",
      lat: 16.6962308,
      lng: 121.6253037,
      severity: "high",
      locationPrecision: "official_incident_pin",
      coordinateSource: "official_incident_pin",
      mappingStatus: "exact_geocode",
      locationConfidence: { level: "high", accuracy: "near_exact", source: "official_incident_pin" },
    }),
    record("pcr-pin-c", {
      pcrId: "PCR-PIN-C",
      sourceKind: "pcr_report",
      barangay: null,
      location: "16.696017, 121.625171",
      lat: 16.6960169,
      lng: 121.6251712,
      severity: "high",
      locationPrecision: "official_incident_pin",
      coordinateSource: "official_incident_pin",
      mappingStatus: "exact_geocode",
      locationConfidence: { level: "high", accuracy: "near_exact", source: "official_incident_pin" },
    }),
  ];

  const areas = calculateOfficialAccidentProneAreas(records, { publicOnly: true });

  assert.equal(areas.length, 1);
  assert.equal(areas[0].risk_level, "High");
  assert.equal(areas[0].unique_incident_count, 3);
  assert.match(areas[0].barangay, /^Mapped official area near /);
  assert.equal(areas[0].is_public_visible, true);
});

test("clusters precise official pins by coordinates when barangay is unavailable", () => {
  const records = [
    record("named-place-pin", {
      pcrId: "PCR-NAMED-PIN",
      sourceKind: "pcr_report",
      barangay: null,
      location: "Quezon",
      lat: 16.6959405,
      lng: 121.6248585,
      severity: "high",
      locationPrecision: "official_incident_pin",
      coordinateSource: "official_incident_pin",
      mappingStatus: "exact_geocode",
      locationConfidence: { level: "high", accuracy: "near_exact", source: "official_incident_pin" },
    }),
    record("coordinate-pin-a", {
      pcrId: "PCR-COORDINATE-A",
      sourceKind: "pcr_report",
      barangay: null,
      location: "16.696017, 121.625171",
      lat: 16.6960169,
      lng: 121.6251712,
      severity: "high",
      locationPrecision: "official_incident_pin",
      coordinateSource: "official_incident_pin",
      mappingStatus: "exact_geocode",
      locationConfidence: { level: "high", accuracy: "near_exact", source: "official_incident_pin" },
    }),
    record("coordinate-pin-b", {
      pcrId: "PCR-COORDINATE-B",
      sourceKind: "pcr_report",
      barangay: null,
      location: "16.696231, 121.625304",
      lat: 16.6962308,
      lng: 121.6253037,
      severity: "high",
      locationPrecision: "official_incident_pin",
      coordinateSource: "official_incident_pin",
      mappingStatus: "exact_geocode",
      locationConfidence: { level: "high", accuracy: "near_exact", source: "official_incident_pin" },
    }),
  ];

  const areas = calculateOfficialAccidentProneAreas(records, { publicOnly: true });

  assert.equal(areas.length, 1);
  assert.equal(areas[0].risk_level, "High");
  assert.equal(areas[0].unique_incident_count, 3);
  assert.match(areas[0].barangay, /^Mapped official area near /);
});

test("reads incident date without falling back to scraper collection timestamps", () => {
  assert.equal(readIncidentDate({ scrapedAt: "2026-08-23", createdAt: "2026-08-23" }), null);
  assert.equal(readIncidentDate({ incidentAt: "2026-01-02T06:00:00.000Z" }).toISOString(), "2026-01-02T06:00:00.000Z");
});

test("excludes missing incident dates from revised 36-month computation but reports diagnostics", () => {
  const areas = calculateAccidentProneAreas([
    record("dated", { incidentDate: "2026-08-01" }),
    record("missing-date", { incidentDate: undefined, date: undefined, scrapedAt: "2026-08-23" }),
  ]);

  assert.equal(areas[0].total_incidents, 2);
  assert.equal(areas[0].unique_incident_count, 1);
  assert.equal(areas[0].diagnostics.some(item => item.reason === "missing_incident_date"), true);
});

test("uses severity burden across all eligible unique crashes", () => {
  const areas = calculateAccidentProneAreas([
    record("a", { severity: "critical", incidentDate: "2026-08-01" }),
    record("b", { severity: "high", incidentDate: "2026-07-01" }),
    record("c", { severity: "moderate", incidentDate: "2026-05-30" }),
    record("d", { severity: "low", incidentDate: "2025-08-28" }),
    record("e", { severity: "critical", incidentDate: "2024-08-28" }),
  ], { referenceDate: REFERENCE_DATE });

  assert.equal(areas[0].severity_burden, 10.5);
  assert.equal(areas[0].unweighted_severity_burden, 9);
  assert.deepEqual(areas[0].severity_counts, {
    low: 1,
    moderate: 1,
    high: 1,
    critical: 2,
    unknown: 0,
  });
});

test("weights recent accidents more strongly than older accidents", () => {
  assert.equal(recencyWeightForIncident(record("week", { incidentDate: "2026-08-21" }), REFERENCE_DATE), 1.75);
  assert.equal(recencyWeightForIncident(record("month", { incidentDate: "2026-07-30" }), REFERENCE_DATE), 1.5);
  assert.equal(recencyWeightForIncident(record("quarter", { incidentDate: "2026-06-01" }), REFERENCE_DATE), 1.25);
  assert.equal(recencyWeightForIncident(record("year", { incidentDate: "2025-12-01" }), REFERENCE_DATE), 1);
  assert.equal(recencyWeightForIncident(record("two-years", { incidentDate: "2025-02-01" }), REFERENCE_DATE), 0.75);
  assert.equal(recencyWeightForIncident(record("three-years", { incidentDate: "2024-02-01" }), REFERENCE_DATE), 0.5);
});

test("classifies the example recency-weighted accident mix as critical", () => {
  const areas = calculateAccidentProneAreas([
    record("black-this-week", { severity: "black", incidentDate: "2026-08-21" }),
    record("red-month-a", { severity: "red", incidentDate: "2026-07-30" }),
    record("red-month-b", { severity: "red", incidentDate: "2026-07-30" }),
    record("red-month-c", { severity: "red", incidentDate: "2026-07-30" }),
    record("yellow-old", { severity: "yellow", incidentDate: "2024-08-28" }),
  ], { referenceDate: REFERENCE_DATE });

  assert.equal(areas[0].unique_incident_count, 5);
  assert.equal(areas[0].unweighted_severity_burden, 10);
  assert.equal(areas[0].severity_burden, 15);
  assert.equal(areas[0].risk_level, "Critical");
});

test("separates recent advisory from recommended risk classification", () => {
  const today = REFERENCE_DATE;
  const recentCritical = today.toISOString().slice(0, 10);
  const areas = calculateAccidentProneAreas([
    record("recent-critical", { incidentDate: recentCritical, severity: "critical" }),
  ], { referenceDate: REFERENCE_DATE });

  assert.equal(areas[0].recommended_risk_level, "Caution");
  assert.equal(areas[0].risk_level, "Caution");
  assert.equal(areas[0].recent_advisory, "Immediate Review");
  assert.equal(areas[0].is_public_visible, false);
});

test("implements the recommended risk thresholds", () => {
  assert.equal(classifyRecommendedRisk({ uniqueIncidentCount: 0, severityBurden: 0 }), "Low");
  assert.equal(classifyRecommendedRisk({ uniqueIncidentCount: 1, severityBurden: 3 }), "Caution");
  assert.equal(classifyRecommendedRisk({ uniqueIncidentCount: 2, severityBurden: 6 }), "Moderate");
  assert.equal(classifyRecommendedRisk({ uniqueIncidentCount: 3, severityBurden: 6 }), "High");
  assert.equal(classifyRecommendedRisk({ uniqueIncidentCount: 5, severityBurden: 12 }), "Critical");
});
