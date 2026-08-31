import { listDegradableEndpoints } from "@app/lib/api/poke/degraded_models";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

// This global table is written in its own transaction, so it escapes the
// per-test rollback. Reset through the resource, not the model: a bare model
// call joins the CLS transaction wrapping each test and deadlocks against it.
beforeEach(async () => {
  await ModelDegradationResource.updateDegradedEndpoints(
    degradableEndpoints().map((endpoint) => ({ ...endpoint, degraded: false }))
  );
});

function degradableEndpoints() {
  return listDegradableEndpoints().map(
    ({ displayName: _, ...endpoint }) => endpoint
  );
}

function endpointAt(index: number) {
  return degradableEndpoints()[index];
}

function postEndpoints(endpoints: unknown[]) {
  return honoApp.request("/api/poke/degraded_models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoints }),
  });
}

function sortByModelId<T extends { modelId: string }>(endpoints: T[]) {
  return [...endpoints].sort((a, b) => a.modelId.localeCompare(b.modelId));
}

async function getDegradedEndpoints() {
  const response = await honoApp.request("/api/poke/degraded_models");
  expect(response.status).toBe(200);
  return sortByModelId((await response.json()).degradedEndpoints);
}

describe("GET /api/poke/degraded_models", () => {
  it("returns the degradable catalog and an empty degraded set", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/degraded_models");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.degradedEndpoints).toEqual([]);
    expect(body.degradableEndpoints.length).toBeGreaterThan(0);
    expect(body.degradableEndpoints[0]).toEqual({
      modelId: expect.any(String),
      providerId: expect.any(String),
      host: expect.any(String),
      displayName: expect.any(String),
    });
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await honoApp.request("/api/poke/degraded_models");

    expect(response.status).toBe(401);
  });
});

describe("POST /api/poke/degraded_models", () => {
  it("degrades and restores only the endpoints it names", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    expect(
      (await postEndpoints([{ ...endpointAt(0), degraded: true }])).status
    ).toBe(200);
    expect(await getDegradedEndpoints()).toEqual([endpointAt(0)]);

    // Leaves the first one degraded: this is the point of the per-endpoint API.
    expect(
      (await postEndpoints([{ ...endpointAt(1), degraded: true }])).status
    ).toBe(200);
    expect(await getDegradedEndpoints()).toEqual(
      sortByModelId([endpointAt(0), endpointAt(1)])
    );

    expect(
      (await postEndpoints([{ ...endpointAt(0), degraded: false }])).status
    ).toBe(200);
    expect(await getDegradedEndpoints()).toEqual([endpointAt(1)]);
  });

  it("is a no-op when an endpoint is already in the requested state", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    expect(
      (
        await postEndpoints([
          { ...endpointAt(0), degraded: true },
          { ...endpointAt(0), degraded: true },
        ])
      ).status
    ).toBe(200);
    expect(
      (await postEndpoints([{ ...endpointAt(0), degraded: true }])).status
    ).toBe(200);
    expect(await getDegradedEndpoints()).toEqual([endpointAt(0)]);

    expect(
      (await postEndpoints([{ ...endpointAt(1), degraded: false }])).status
    ).toBe(200);
    expect(await getDegradedEndpoints()).toEqual([endpointAt(0)]);
  });

  it("settles on the last requested state when an endpoint is named twice", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postEndpoints([
      { ...endpointAt(0), degraded: true },
      { ...endpointAt(0), degraded: false },
    ]);

    expect(response.status).toBe(200);
    expect(await getDegradedEndpoints()).toEqual([]);
  });

  it("returns 400 for an endpoint that is not in the catalog", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await postEndpoints([
      { ...endpointAt(0), host: "not-a-host", degraded: true },
    ]);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("not-a-host");
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await postEndpoints([
      { ...endpointAt(0), degraded: true },
    ]);

    expect(response.status).toBe(401);
  });
});
