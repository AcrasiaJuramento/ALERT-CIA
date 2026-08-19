import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectDeliveryTarget } from "./sync-routing.js";

describe("selectDeliveryTarget", () => {
  it("routes a pending cloud operation directly to cloud when cloud is online", () => {
    const route = selectDeliveryTarget(
      { destination: "cloud", synced_to_cloud: false, synced_to_local: false },
      { mode: "cloud", cloudOnline: true, localOnline: false },
    );

    assert.deepEqual(route, { target: "cloud" });
  });

  it("stages a cloud operation on the local server when cloud is offline", () => {
    const route = selectDeliveryTarget(
      { destination: "cloud", synced_to_cloud: false, synced_to_local: false },
      { mode: "local", cloudOnline: false, localOnline: true },
    );

    assert.deepEqual(route, { target: "local" });
  });

  it("waits for cloud after a cloud operation has already been staged locally", () => {
    const route = selectDeliveryTarget(
      { destination: "cloud", synced_to_cloud: false, synced_to_local: true },
      { mode: "local", cloudOnline: false, localOnline: true },
    );

    assert.equal(route.target, null);
    assert.equal(route.waitStatus, "waiting_cloud");
  });

  it("does not mark a local-only operation as cloud synced", () => {
    const route = selectDeliveryTarget(
      { destination: "local", synced_to_local: false, synced_to_cloud: false },
      { mode: "cloud", cloudOnline: true, localOnline: true },
    );

    assert.deepEqual(route, { target: "local" });
  });
});
