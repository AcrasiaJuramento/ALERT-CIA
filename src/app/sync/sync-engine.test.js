import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectDeliveryTarget } from "./sync-routing.js";

describe("selectDeliveryTarget", () => {
  it("routes a pending operation directly to cloud when cloud is online", () => {
    const route = selectDeliveryTarget(
      { destination: "cloud", synced_to_cloud: false },
      { mode: "cloud", cloudOnline: true, localOnline: false },
    );

    assert.deepEqual(route, { target: "cloud" });
  });

  it("waits for internet when cloud is offline", () => {
    const route = selectDeliveryTarget(
      { destination: "cloud", synced_to_cloud: false },
      { mode: "offline", cloudOnline: false, localOnline: false },
    );

    assert.equal(route.target, null);
    assert.equal(route.waitStatus, "waiting_cloud");
  });

  it("marks an already cloud-synced operation complete", () => {
    const route = selectDeliveryTarget(
      { destination: "cloud", synced_to_cloud: true },
      { mode: "cloud", cloudOnline: true, localOnline: false },
    );

    assert.deepEqual(route, { target: null, complete: true });
  });
});
