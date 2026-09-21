import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import {
  logModelHealthProbeFailedActivity,
  logModelHealthRecoveryActivity,
} from "@app/temporal/model_health/activities";
import { ModelDegradationFactory } from "@app/tests/utils/ModelDegradationFactory";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/llm/health/transitions", () => ({
  logModelHealthTransition: vi.fn(),
}));

const ENDPOINT = {
  modelId: "gpt-5.4-mini",
  providerId: "openai",
  host: "openai-responses",
} as const;

describe("model health recovery activities", () => {
  afterEach(async () => {
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...ENDPOINT, degraded: false },
    ]);
    vi.clearAllMocks();
  });

  it("overwrites the degradation after a failed probe", async () => {
    await logModelHealthProbeFailedActivity({
      endpoint: ENDPOINT,
      degradedForMs: 10,
      persistDegradation: true,
    });

    expect(
      await ModelDegradationResource.listDegradedEndpoints()
    ).toContainEqual(ENDPOINT);
    expect(logModelHealthTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: ENDPOINT,
        transition: "probe_failed",
        degradedForMs: 10,
        expiresAt: expect.any(Date),
      })
    );
  });

  it("removes the degradation after recovery", async () => {
    await ModelDegradationFactory.degraded(ENDPOINT, {
      expiresAt: new Date(Date.now() + 60_000),
    });

    await logModelHealthRecoveryActivity({
      endpoint: ENDPOINT,
      degradedForMs: 10,
      persistDegradation: true,
    });

    expect(
      await ModelDegradationResource.listDegradedEndpoints()
    ).not.toContainEqual(ENDPOINT);
    expect(logModelHealthTransition).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      transition: "recovered",
      degradedForMs: 10,
    });
  });

  it("logs without writing when degradation persistence is disabled", async () => {
    await logModelHealthProbeFailedActivity({
      endpoint: ENDPOINT,
      degradedForMs: 10,
      persistDegradation: false,
    });

    expect(
      await ModelDegradationResource.listDegradedEndpoints()
    ).not.toContainEqual(ENDPOINT);
    expect(logModelHealthTransition).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      transition: "probe_failed",
      degradedForMs: 10,
      expiresAt: undefined,
    });
  });
});
