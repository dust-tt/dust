import { describe, expect, test } from "bun:test";
import { type Identity, StaticTokenVerifier } from "../src/auth";
import { FakeBlaxelProvider } from "../src/blaxel/fake-provider";
import { ControlPlane } from "../src/control-plane";
import { handleRequest } from "../src/router";
import { InMemoryBeeStore } from "../src/store";

const ALICE_TOKEN = "tok-alice";
const alice: Identity = { id: "user_alice" };

function harness() {
  const cp = new ControlPlane({
    store: new InMemoryBeeStore(),
    provider: new FakeBlaxelProvider(),
    region: "eu",
  });
  const verifier = new StaticTokenVerifier(new Map([[ALICE_TOKEN, alice]]));
  const call = (method: string, path: string, body?: unknown, token = ALICE_TOKEN) =>
    handleRequest(
      cp,
      verifier,
      new Request(`http://cp${path}`, {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  return { call };
}

describe("auth gate", () => {
  test("rejects a request with no bearer token", async () => {
    const { call } = harness();
    const res = await call("GET", "/bees", undefined, "");
    expect(res.status).toBe(401);
  });

  test("rejects an unknown token", async () => {
    const { call } = harness();
    const res = await call("GET", "/bees", undefined, "bogus");
    expect(res.status).toBe(401);
  });
});

describe("bee lifecycle over HTTP", () => {
  test("provision → list → connect → reclaim", async () => {
    const { call } = harness();

    const created = await call("POST", "/bees", { name: "my-feature" });
    expect(created.status).toBe(201);
    const bee = (await created.json()) as { id: string; hostState: string };
    expect(bee.hostState).toBe("ready");

    const list = await call("GET", "/bees");
    expect(list.status).toBe(200);
    expect((await list.json()) as unknown[]).toHaveLength(1);

    const connect = await call("POST", `/bees/${bee.id}/connect`);
    expect(connect.status).toBe(200);
    const conn = (await connect.json()) as { sessionToken: string };
    expect(conn.sessionToken).toContain("fake-session");

    const ready = await call("GET", `/bees/${bee.id}/ready`);
    expect(((await ready.json()) as { ready: boolean }).ready).toBe(true);

    const reclaimed = await call("DELETE", `/bees/${bee.id}`);
    expect(reclaimed.status).toBe(204);

    const after = await call("GET", "/bees");
    expect((await after.json()) as unknown[]).toHaveLength(0);
  });

  test("rejects an invalid bee name with 400", async () => {
    const { call } = harness();
    const res = await call("POST", "/bees", { name: "Bad_Name" });
    expect(res.status).toBe(400);
  });

  test("returns 404 for an unknown bee", async () => {
    const { call } = harness();
    const res = await call("GET", "/bees/bee_does_not_exist");
    expect(res.status).toBe(404);
  });
});
