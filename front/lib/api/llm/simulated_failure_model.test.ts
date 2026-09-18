import { applyDegradedEndpointCacheUpdate } from "@app/lib/api/assistant/degraded_models";
import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import {
  clearSimulatedFailureModelHealthWindow,
  getSimulatedFailureModelStatus,
  isSimulatedFailureModelDegraded,
  SIMULATED_FAILURE_MODEL_ENDPOINT,
  seedSimulatedFailureModelHealthWindow,
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
    applyDegradedEndpointCacheUpdate([
      { modelId: SIMULATED_FAILURE_MODEL_ENDPOINT.modelId, degraded: false },
    ]);
    redisMock.reset();
  });

  it("defaults to an unseeded window", async () => {
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: false,
      degradation: "none",
    });
  });

  it("reports a seeded window without writing degradation", async () => {
    await seedSimulatedFailureModelHealthWindow();

    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: true,
      degradation: "none",
    });

    await clearSimulatedFailureModelHealthWindow();
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: false,
      degradation: "none",
    });
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

  it("reads a degradation row as degraded even when the process cache is cold", async () => {
    await expect(isSimulatedFailureModelDegraded()).resolves.toBe(false);

    await ModelDegradationFactory.degraded(SIMULATED_FAILURE_MODEL_ENDPOINT);
    try {
      await expect(isSimulatedFailureModelDegraded()).resolves.toBe(true);
    } finally {
      await ModelDegradationResource.updateDegradedEndpoints([
        { ...SIMULATED_FAILURE_MODEL_ENDPOINT, degraded: false },
      ]);
      applyDegradedEndpointCacheUpdate([
        { modelId: SIMULATED_FAILURE_MODEL_ENDPOINT.modelId, degraded: false },
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
