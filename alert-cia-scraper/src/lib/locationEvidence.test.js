import test from "node:test";
import assert from "node:assert/strict";
import { extractLocation, resolveIsabelaGeoJsonLocation } from "./locations.js";
import { hasSupportedIncidentLocation, stripNewsDateline } from "./locationEvidence.js";

test("a Cauayan city mention cannot invent District I through the Poblacion alias", () => {
  assert.equal(resolveIsabelaGeoJsonLocation("Motorcycle collision in Cauayan City"), null);
  assert.equal(extractLocation("Bus crash in Cauayan City, Isabela")?.barangay, null);
  assert.equal(resolveIsabelaGeoJsonLocation("Barangay Poblacion, Cauayan City"), null);
});

test("explicit accident barangay overrides a municipality-only title", () => {
  const title = "Isa patay dalawa sugatan sa banggaan ng dalawang motorsiklo sa Cauayan City";
  const snippet = "CAUAYAN CITY - Nasawi ang isang lalaki habang dalawa naman ang nasugatan sa banggaan ng dalawang motorsiklo sa Barangay Rizal.";
  const location = extractLocation(title, snippet);
  assert.equal(location?.municipality, "Cauayan");
  assert.equal(location?.barangay, "Rizal");
  assert.equal(hasSupportedIncidentLocation({ title, snippet, verified_municipality: "Cauayan", verified_barangay: "District I" }), false);
  assert.equal(hasSupportedIncidentLocation({ title, snippet, verified_municipality: "Cauayan", verified_barangay: "Rizal" }), true);
  assert.equal(hasSupportedIncidentLocation({ title, verified_municipality: "Cauayan", verified_barangay: "District I", publicMapProjection: true }), false);
});

test("Capintalan Carranglan Nueva Ecija crash is not pinned to the Cauayan newsroom", () => {
  const title = "Mag-iina na naglalakad patungong Simbahan, nahagip ng tumagilid na 10-wheeler truck";
  const body = "CAUAYAN CITY- Dead on the spot ang isang 15-anyos, habang sugatan ang kaniyang ina na 30-anyos at kapatid na 8-anyos matapos na mahagip sila ng tumagilid na 10-wheeler truck na may kargang sako-sakong mais sa Capintalan, Carranglan, Nueva Ecija.";
  assert.ok(stripNewsDateline(body).startsWith("Dead on the spot"));
  assert.equal(extractLocation(title, body, body), null);
  assert.equal(hasSupportedIncidentLocation({
    title,
    snippet: body,
    extracted_municipality: "Cauayan",
    verified_municipality: "Cauayan",
    status: "approved",
    raw_payload: { body },
  }), false);
});

test("Cauayan newsroom datelines cannot locate international accidents", () => {
  assert.equal(extractLocation(
    "11 katao, nasawi matapos magbanggaan ang tour bus at trak sa Turkiye",
    "CAUAYAN CITY - Nasawi ang 11 katao sa banggaan sa Turkiye.",
  ), null);
});

test("publisher title suffix and interview attribution are not accident locations", () => {
  assert.equal(extractLocation(
    "Pinsalang iniwan ng aksidente sa Diadi, Nueva Vizcaya - Bombo Radyo Cauayan",
    "CAUAYAN CITY - Naganap ang banggaan sa Diadi, Nueva Vizcaya.",
    "Sa naging panayam ng Bombo Radyo Cauayan, sinabi na may banggaan.",
  ), null);
});

test("barangay names shared with municipalities do not create a false municipality conflict", () => {
  assert.equal(extractLocation(
    "Aksidente sa kalsada, binabantayan sa Cordon, Isabela - Bombo Radyo Cauayan",
    "CAUAYAN CITY- Nagkaroon ng banggaan sa Barangay Quirino sa nasabing bayan.",
  )?.municipality, "Cordon");
});

test("removes newsroom datelines with province and dash variants", () => {
  for (const dash of ["-", "—", "–"]) {
    assert.equal(stripNewsDateline(`CAUAYAN CITY, Isabela ${dash} A bus crashed.`), "A bus crashed.");
    assert.equal(stripNewsDateline(`Cauayan City ${dash} A bus crashed.`), "A bus crashed.");
  }
});

test("dateline-only evidence is rejected even with an explicit Isabela label", () => {
  assert.equal(extractLocation("Bus crash kills two", "CAUAYAN CITY, Isabela — Two killed in a bus crash."), null);
});

test("uses the actual crash site instead of the newsroom city", () => {
  const location = extractLocation("Dalawa nasawi sa banggaan", "CAUAYAN CITY - Naganap ang banggaan sa Barangay San Fabian, Echague, Isabela.");
  assert.equal(location?.municipality, "Echague");
  assert.equal(location?.barangay, "San Fabian");
  assert.equal(location?.confidence.incident_location_verified, true);
});

test("actual Cauayan incidents remain eligible", () => {
  assert.equal(extractLocation("Bus crash in Cauayan City, Isabela")?.municipality, "Cauayan");
});

test("victim residence does not establish the accident location", () => {
  assert.equal(extractLocation("Bus crash kills Isabela resident", "Nasawi ang isang residente ng Cauayan City, Isabela sa banggaan."), null);
  assert.equal(extractLocation("Bus crash", "Nasawi sa banggaan ang biktima na mula sa Echague, Isabela."), null);
});

test("ambiguous crash municipalities require review", () => {
  assert.equal(extractLocation("Crash in Echague, Isabela", "The crash happened in Jones, Isabela."), null);
});

test("legacy pins require article evidence matching their stored municipality", () => {
  const row = { extracted_municipality: "Cauayan", title: "Bus crash in Turkiye", snippet: "CAUAYAN CITY - Eleven killed in a collision." };
  assert.equal(hasSupportedIncidentLocation(row), false);
  assert.equal(hasSupportedIncidentLocation({ ...row, status: "approved", verified_at: "2026-10-25" }), false);
  assert.equal(hasSupportedIncidentLocation({ ...row, location_corrected_at: "2026-10-25" }), true);
  assert.equal(hasSupportedIncidentLocation({ extracted_municipality: "Echague", title: "Crash in Echague, Isabela" }), true);
  assert.equal(hasSupportedIncidentLocation({ extracted_municipality: "Cauayan", title: "Crash in Echague, Isabela" }), false);
  assert.equal(hasSupportedIncidentLocation({ verified_municipality: "Echague", title: "Two killed in bus crash", location_confidence: { evidence: "The crash happened in Echague, Isabela." } }), true);
  assert.equal(hasSupportedIncidentLocation({ ...row, location_confidence: { corrected: true } }), true);
});
