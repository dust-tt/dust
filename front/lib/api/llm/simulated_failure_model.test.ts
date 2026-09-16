import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import {
  getSimulatedFailureModelStatus,
  SIMULATED_FAILURE_MODEL_ENDPOINT,
  seedSimulatedFailureModelHealthWindow,
  setSimulatedFailureModelFailure,
  triggerSimulatedFailureModelFailure,
} from "@app/lib/api/llm/simulated_failure_model";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { afterEach, describe, expect, it } from "vitest";

describe("simulated failure model control", () => {
  afterEach(async () => {
    await setSimulatedFailureModelFailure({ enabled: false, ttlSeconds: 1 });
    redisMock.reset();
  });

  it("defaults healthy when no failure is armed", async () => {
    await setSimulatedFailureModelFailure({ enabled: false, ttlSeconds: 1 });

    expect(await triggerSimulatedFailureModelFailure()).toBe(false);
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: false,
      failureTriggered: false,
      degradation: "none",
    });
  });

  it("throws failures without mutating degradation directly", async () => {
    await setSimulatedFailureModelFailure({ enabled: true, ttlSeconds: 60 });

    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: true,
      failureTriggered: false,
      degradation: "none",
    });

    expect(await triggerSimulatedFailureModelFailure()).toBe(true);
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: true,
      failureTriggered: true,
      degradation: "none",
    });

    await setSimulatedFailureModelFailure({ enabled: false, ttlSeconds: 1 });
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: false,
      failureTriggered: false,
      degradation: "none",
    });
  });

  it("reports an operator-flagged degradation as permanent", async () => {
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...SIMULATED_FAILURE_MODEL_ENDPOINT, degraded: true },
    ]);

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
