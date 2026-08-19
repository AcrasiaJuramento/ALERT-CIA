import assert from "node:assert/strict";
import { test } from "node:test";
import { gpsAccuracyLabel, gpsAccuracyTone, gpsStatusMessage } from "./locationQuality.js";

test("classifies GPS accuracy for navigation guidance", () => {
  assert.equal(gpsAccuracyLabel(12), "High accuracy");
  assert.equal(gpsAccuracyLabel(60), "Usable accuracy");
  assert.equal(gpsAccuracyLabel(120), "Weak accuracy");
  assert.equal(gpsAccuracyLabel(250), "Low accuracy");
});

test("uses permission and browser failures as danger states", () => {
  assert.equal(gpsAccuracyTone(12, "denied"), "danger");
  assert.equal(gpsStatusMessage("denied"), "GPS permission denied. Use manual position confirmation.");
});
