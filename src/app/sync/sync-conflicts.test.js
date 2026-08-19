import assert from "node:assert/strict";
import { test } from "node:test";
import { changedSyncFields, conflictSeverity, hasMeaningfulSyncConflict } from "./sync-conflicts.js";

test("ignores sync metadata when comparing local and cloud records", () => {
  assert.equal(hasMeaningfulSyncConflict(
    { patientName: "Juan", sync_status: "pending", updatedAt: "local" },
    { patientName: "Juan", sync_status: "synced", updatedAt: "cloud" },
  ), false);
});

test("detects meaningful local-cloud record conflicts", () => {
  const changes = changedSyncFields(
    { patientName: "Juan", chiefComplaint: "Head injury" },
    { patientName: "Juan", chiefComplaint: "Chest pain" },
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, "chiefComplaint");
  assert.equal(conflictSeverity(changes), "high");
});
