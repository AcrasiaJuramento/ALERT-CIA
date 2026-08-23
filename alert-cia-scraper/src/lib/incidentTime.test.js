import assert from "node:assert/strict";
import test from "node:test";
import { extractIncidentDateTime } from "./incidentTime.js";

test("extracts stated Filipino accident date and afternoon time", () => {
  const text = "Dalawang magkapatid na operator ng heavy equipment ang nasugatan matapos makuryente sa isang aksidente habang nagbababa ng semento sa Barangay Nappaccu Grande, Reina Mercedes, pasado alas-2:00 ng hapon nitong ikalawa ng Enero.";
  const result = extractIncidentDateTime(text, "2026-08-13T06:17:00.000Z");

  assert.equal(result.incident_at, "2026-01-02T06:00:00.000Z");
  assert.equal(result.source, "article_text");
  assert.match(result.evidence, /alas-2:00/i);
  assert.match(result.evidence, /Enero/i);
});

test("uses article publish date when only incident time is stated", () => {
  const text = "Nasugatan ang isang motorista sa aksidente pasado alas-7:30 ng gabi sa national highway.";
  const result = extractIncidentDateTime(text, "2026-08-13T06:17:00.000Z");

  assert.equal(result.incident_at, "2026-08-13T11:30:00.000Z");
  assert.equal(result.source, "article_text_time_with_published_date");
});

test("does not treat ages as accident times", () => {
  const text = "Nasugatan si Garry Pablo, 37 taong gulang, residente ng Ilocos Norte.";
  const result = extractIncidentDateTime(text, "2026-08-13T06:17:00.000Z");

  assert.equal(result, null);
});
