import {
  isModelEndpointAutomaticallyDegraded,
  markModelAutomaticallyDegraded,
} from "@app/lib/api/llm/health/automatic_degradation";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import {
  logModelHealthProbeFailedActivity,
  logModelHealthRecoveryActivity,
} from "@app/temporal/model_health/activities";
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
    await ModelDegradationResource.updateDegradedEndpoints(
      [{ ...ENDPOINT, degraded: false }],
      { source: "automatic" }
    );
    vi.clearAllMocks();
  });

  it("renews automatic degradation after a failed probe", async () => {
    await markModelAutomaticallyDegraded(ENDPOINT, 1);

    await logModelHealthProbeFailedActivity({
      endpoint: ENDPOINT,
      degradedForMs: 10,
    });

    expect(await isModelEndpointAutomaticallyDegraded(ENDPOINT)).toBe(true);
    expect(logModelHealthTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: ENDPOINT,
        transition: "probe_failed",
        degradedForMs: 10,
        expiresAt: expect.any(Date),
      })
    );
  });

  it("clears automatic degradation after recovery", async () => {
    const observedExpiresAt = await markModelAutomaticallyDegraded(ENDPOINT);

    await logModelHealthRecoveryActivity({
      endpoint: ENDPOINT,
      degradedForMs: 10,
      observedExpiresAtMs: observedExpiresAt.getTime(),
    });

    expect(await isModelEndpointAutomaticallyDegraded(ENDPOINT)).toBe(false);
    expect(logModelHealthTransition).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      transition: "recovered",
      degradedForMs: 10,
      expiresAt: observedExpiresAt,
      cleared: true,
    });
  });

  it("does not report recovery when a newer lease survives", async () => {
    const nowMs = Date.now();
    const observedExpiresAt = await markModelAutomaticallyDegraded(
      ENDPOINT,
      nowMs
    );
    await markModelAutomaticallyDegraded(ENDPOINT, nowMs + 1);

    expect(
      await logModelHealthRecoveryActivity({
        endpoint: ENDPOINT,
        degradedForMs: 10,
        observedExpiresAtMs: observedExpiresAt.getTime(),
      })
    ).toBe(false);
    expect(await isModelEndpointAutomaticallyDegraded(ENDPOINT)).toBe(true);
    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });
});
