import {
  clearAutomaticModelDegradation,
  isModelEndpointAutomaticallyDegraded,
  markModelAutomaticallyDegraded,
  refreshAutomaticallyDegradedModelIds,
} from "@app/lib/api/llm/health/automatic_degradation";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { afterEach, describe, expect, it } from "vitest";

const ENDPOINT = {
  modelId: "gpt-5.4-mini",
  providerId: "openai",
  host: "openai-responses",
} as const;

const SECOND_ENDPOINT = {
  ...ENDPOINT,
  host: "agent-platform",
} as const;

describe("automatic model degradation", () => {
  afterEach(async () => {
    redisMock.reset();
    await refreshAutomaticallyDegradedModelIds();
  });

  it("projects an unhealthy endpoint into routing state", async () => {
    await markModelAutomaticallyDegraded(ENDPOINT);

    expect(await isModelEndpointAutomaticallyDegraded(ENDPOINT)).toBe(true);
    expect(await refreshAutomaticallyDegradedModelIds()).toContain(
      ENDPOINT.modelId
    );
  });

  it("expires a projection that recovery no longer refreshes", async () => {
    await markModelAutomaticallyDegraded(ENDPOINT, 1);

    expect(
      await isModelEndpointAutomaticallyDegraded(
        ENDPOINT,
        Number.MAX_SAFE_INTEGER
      )
    ).toBe(false);
    expect(
      await refreshAutomaticallyDegradedModelIds(Number.MAX_SAFE_INTEGER)
    ).not.toContain(ENDPOINT.modelId);
  });

  it("keeps a model degraded while another endpoint remains unhealthy", async () => {
    await markModelAutomaticallyDegraded(ENDPOINT);
    await markModelAutomaticallyDegraded(SECOND_ENDPOINT);

    await clearAutomaticModelDegradation(ENDPOINT);

    expect(await refreshAutomaticallyDegradedModelIds()).toContain(
      ENDPOINT.modelId
    );
  });
});
