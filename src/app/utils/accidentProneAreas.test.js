import test from "node:test";
import assert from "node:assert/strict";
import { calculateAccidentProneAreas } from "./accidentProneAreas.js";
import { calculateAccidentProneAreas as calculateMobileAreas } from "../../../../Alert-cia-expo-go-Application/src/utils/accidentProneAreas.js";
import { buildAccidentProneDataset } from "../../../../Alert-cia-expo-go-Application/tests/fixtures/accidentProneDataset.mjs";

const records = buildAccidentProneDataset();

test("Web requires at least two qualifying incidents", () => {
  assert.deepEqual(calculateAccidentProneAreas([records[0]], { publicOnly: true }), []);
  assert.equal(calculateAccidentProneAreas(records.slice(0, 2), { publicOnly: true })[0].total_incidents, 2);
});

test("Web prevents duplicate records but counts distinct incidents sharing coordinates", () => {
  assert.equal(calculateAccidentProneAreas([records[0], { ...records[0] }, records[1]], { publicOnly: true })[0].total_incidents, 2);
  assert.equal(calculateAccidentProneAreas(records.slice(3), { publicOnly: true })[0].total_incidents, 2);
});

test("Web recalculates when a record status changes", () => {
  const peer = { ...records[2], id: "peer", status: "verified" };
  assert.equal(calculateAccidentProneAreas([records[2], peer], { publicOnly: true }).length, 0);
  assert.equal(calculateAccidentProneAreas([{ ...records[2], status: "verified" }, peer], { publicOnly: true }).length, 1);
});

test("Web and Mobile produce the same areas from the shared dataset", () => {
  const comparable = area => ({
    area_id: area.area_id,
    barangay: area.barangay,
    latitude: area.latitude,
    longitude: area.longitude,
    total_incidents: area.total_incidents,
    frequency_score: area.frequency_score,
    severity_score: area.severity_score,
    recency_score: area.recency_score,
    source_reliability_score: area.source_reliability_score,
    total_risk_score: area.total_risk_score,
    risk_level: area.risk_level,
    point_hotspot_eligible: area.point_hotspot_eligible,
  });
  assert.deepEqual(
    calculateAccidentProneAreas(records, { publicOnly: true }).map(comparable),
    calculateMobileAreas(records, { publicOnly: true }).map(comparable),
  );
});
