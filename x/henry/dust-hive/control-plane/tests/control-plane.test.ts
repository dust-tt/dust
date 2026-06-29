import { beforeEach, describe, expect, test } from "bun:test";
import type { Identity } from "../src/auth";
import { FakeBlaxelProvider } from "../src/blaxel/fake-provider";
import type { BlaxelProvider } from "../src/blaxel/provider";
import { ControlPlane } from "../src/control-plane";
import { InMemoryBeeStore } from "../src/store";

const alice: Identity = { id: "user_alice" };
const bob: Identity = { id: "user_bob" };

function makeControlPlane(provider: BlaxelProvider = new FakeBlaxelProvider()): ControlPlane {
  let seq = 0;
  return new ControlPlane({
    store: new InMemoryBeeStore(),
    provider,
    region: "eu",
    now: () => "2026-06-26T00:00:00.000Z",
    genId: () => `bee_test_${++seq}`,
  });
}

// Provider whose bootBee always fails — to exercise provisionBee rollback.
class FailingBootProvider extends FakeBlaxelProvider {
  override bootBee(): Promise<void> {
    return Promise.reject(new Error("warm failed"));
  }
}

describe("provisionBee", () => {
  let cp: ControlPlane;
  beforeEach(() => {
    cp = makeControlPlane();
  });

  test("creates a ready, owned bee with a preview URL", async () => {
    const result = await cp.provisionBee(alice, { name: "my-feature" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.owner).toBe("user_alice");
    expect(result.value.hostState).toBe("ready");
    expect(result.value.sandboxId).not.toBeNull();
    expect(result.value.previewUrl).toContain("preview.bl");
  });

  test("rejects an invalid name", async () => {
    const result = await cp.provisionBee(alice, { name: "Bad_Name" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_request");
  });

  test("rejects a duplicate name for the same owner", async () => {
    await cp.provisionBee(alice, { name: "dup" });
    const second = await cp.provisionBee(alice, { name: "dup" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("conflict");
  });

  test("allows the same name for different owners", async () => {
    await cp.provisionBee(alice, { name: "shared" });
    const result = await cp.provisionBee(bob, { name: "shared" });
    expect(result.ok).toBe(true);
  });

  test("records the seed scenario when provided", async () => {
    const result = await cp.provisionBee(alice, { name: "seeded", scenario: "demo" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scenario).toBe("demo");
  });

  test("rolls back on boot failure: errors, frees the name, leaves no bee", async () => {
    const failing = makeControlPlane(new FailingBootProvider());

    const result = await failing.provisionBee(alice, { name: "doomed" });
    expect(result.ok).toBe(false);

    // The failed bee must not linger (no stranded `provisioning` record).
    const list = await failing.listBees(alice);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(0);

    // And the name is free to retry (no 409 lock).
    const retry = await failing.provisionBee(alice, { name: "doomed" });
    expect(retry.ok).toBe(false); // still fails (boot still broken) ...
    const second = await failing.listBees(alice);
    expect(second.ok && second.value).toHaveLength(0); // ... but never strands.
  });
});

describe("ownership enforcement", () => {
  test("listBees only returns the caller's bees", async () => {
    const cp = makeControlPlane();
    await cp.provisionBee(alice, { name: "a-bee" });
    await cp.provisionBee(bob, { name: "b-bee" });

    const aliceList = await cp.listBees(alice);
    expect(aliceList.ok).toBe(true);
    if (!aliceList.ok) return;
    expect(aliceList.value).toHaveLength(1);
    expect(aliceList.value[0]?.name).toBe("a-bee");
  });

  test("another owner's bee reads as not_found (no existence leak)", async () => {
    const cp = makeControlPlane();
    const aliceBee = await cp.provisionBee(alice, { name: "secret" });
    expect(aliceBee.ok).toBe(true);
    if (!aliceBee.ok) return;

    const bobGet = await cp.getBee(bob, aliceBee.value.id);
    expect(bobGet.ok).toBe(false);
    if (bobGet.ok) return;
    expect(bobGet.error.kind).toBe("not_found");
  });

  test("another owner cannot connect to or reclaim a bee", async () => {
    const cp = makeControlPlane();
    const aliceBee = await cp.provisionBee(alice, { name: "guarded" });
    if (!aliceBee.ok) return;

    const connect = await cp.connect(bob, aliceBee.value.id);
    expect(connect.ok).toBe(false);
    const reclaim = await cp.reclaim(bob, aliceBee.value.id);
    expect(reclaim.ok).toBe(false);
  });
});

describe("connect / ready / reclaim", () => {
  test("connect returns a session token and preview URL for a ready bee", async () => {
    const cp = makeControlPlane();
    const bee = await cp.provisionBee(alice, { name: "live" });
    if (!bee.ok) return;

    const connect = await cp.connect(alice, bee.value.id);
    expect(connect.ok).toBe(true);
    if (!connect.ok) return;
    expect(connect.value.sessionToken).toContain("fake-session");
    // Preview token authenticates the front URL — a distinct surface from the
    // exec session token.
    expect(connect.value.previewToken).toContain("fake-preview");
    expect(connect.value.previewToken).not.toBe(connect.value.sessionToken);
    expect(connect.value.previewUrl).toContain("preview.bl");
    expect(connect.value.sandboxId).toBe("sbx-live");
  });

  test("ready reports true for a provisioned, awake bee", async () => {
    const cp = makeControlPlane();
    const bee = await cp.provisionBee(alice, { name: "ready-bee" });
    if (!bee.ok) return;

    const ready = await cp.ready(alice, bee.value.id);
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.value.ready).toBe(true);
  });

  test("reclaim removes the bee from the registry", async () => {
    const cp = makeControlPlane();
    const bee = await cp.provisionBee(alice, { name: "doomed" });
    if (!bee.ok) return;

    const reclaim = await cp.reclaim(alice, bee.value.id);
    expect(reclaim.ok).toBe(true);

    const afterList = await cp.listBees(alice);
    if (!afterList.ok) return;
    expect(afterList.value).toHaveLength(0);

    const afterGet = await cp.getBee(alice, bee.value.id);
    expect(afterGet.ok).toBe(false);
  });
});
