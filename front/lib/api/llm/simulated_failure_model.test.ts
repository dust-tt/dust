import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import {
  clearSimulatedFailureModelHealthWindow,
  getSimulatedFailureModelStatus,
  SIMULATED_FAILURE_MODEL_ENDPOINT,
  seedSimulatedFailureModelHealthWindow,
  triggerSimulatedFailureModelFailure,
} from "@app/lib/api/llm/simulated_failure_model";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ModelDegradationFactory } from "@app/tests/utils/ModelDegradationFactory";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("simulated failure model control", () => {
  beforeEach(async () => {
    await createResourceTest({ role: "admin" });
    redisMock.reset();
  });

  afterEach(async () => {
    await clearSimulatedFailureModelHealthWindow();
    redisMock.reset();
  });

  it("defaults healthy when the breaker window is not seeded", async () => {
    expect(await triggerSimulatedFailureModelFailure()).toBe(false);
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: false,
      degradation: "none",
    });
  });

  it("injects a failure from the seeded window without writing degradation", async () => {
    await seedSimulatedFailureModelHealthWindow();

    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: true,
      degradation: "none",
    });

    expect(await triggerSimulatedFailureModelFailure()).toBe(true);
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: true,
      degradation: "none",
    });

    await clearSimulatedFailureModelHealthWindow();
    expect(await triggerSimulatedFailureModelFailure()).toBe(false);
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: false,
      degradation: "none",
    });
  });

  it("stops injecting once the breaker has a lease", async () => {
    await seedSimulatedFailureModelHealthWindow();
    await ModelDegradationFactory.degraded(SIMULATED_FAILURE_MODEL_ENDPOINT, {
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    });

    try {
      expect(await triggerSimulatedFailureModelFailure()).toBe(false);
      await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
        failureEnabled: true,
        degradation: "lease",
      });
    } finally {
      await ModelDegradationResource.updateDegradedEndpoints([
        { ...SIMULATED_FAILURE_MODEL_ENDPOINT, degraded: false },
      ]);
    }
  });

  it("reports an operator-flagged degradation as permanent", async () => {
    await ModelDegradationFactory.degraded(SIMULATED_FAILURE_MODEL_ENDPOINT);

    try {
      await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
        degradation: "permanent",
      });
    } finally {
      await ModelDegradationResource.updateDegradedEndpoints([
        { ...SIMULATED_FAILURE_MODEL_ENDPOINT, degraded: false },
      ]);
    }
  });

  it("reports a breaker lease as a lease", async () => {
    await ModelDegradationFactory.degraded(SIMULATED_FAILURE_MODEL_ENDPOINT, {
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    });

    try {
      await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
        degradation: "lease",
      });
    } finally {
      await ModelDegradationResource.updateDegradedEndpoints([
        { ...SIMULATED_FAILURE_MODEL_ENDPOINT, degraded: false },
      ]);
    }
  });

  it("seeds the health window one real provider failure below breach", async () => {
    const now = new Date("2026-09-15T18:00:00Z");

    await seedSimulatedFailureModelHealthWindow(now);

    await expect(
      readEndpointWindow(SIMULATED_FAILURE_MODEL_ENDPOINT, now)
    ).resolves.toEqual({
      attempts: MIN_ATTEMPTS_IN_WINDOW - 1,
      providerErrors:
        Math.ceil(MIN_ATTEMPTS_IN_WINDOW * ERROR_RATIO_THRESHOLD) - 1,
    });
  });
});
