import {
  clearAutomaticModelDegradation,
  isModelEndpointAutomaticallyDegraded,
  markModelAutomaticallyDegraded,
  refreshAutomaticallyDegradedModelIds,
} from "@app/lib/api/llm/health/automatic_degradation";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
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
    await ModelDegradationResource.updateDegradedEndpoints(
      [
        { ...ENDPOINT, degraded: false },
        { ...SECOND_ENDPOINT, degraded: false },
      ],
      { source: "automatic" }
    );
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...ENDPOINT, degraded: false },
    ]);
    await refreshAutomaticallyDegradedModelIds();
  });

  it("projects an unhealthy endpoint into routing state", async () => {
    await markModelAutomaticallyDegraded(ENDPOINT);

    expect(await isModelEndpointAutomaticallyDegraded(ENDPOINT)).toBe(true);
    expect(await refreshAutomaticallyDegradedModelIds()).toContain(
      ENDPOINT.modelId
    );
  });

  it("expires automatic degradation that recovery no longer refreshes", async () => {
    const expiresAt = await markModelAutomaticallyDegraded(ENDPOINT, 1);
    const afterExpiryMs = expiresAt.getTime() + 1;

    expect(
      await isModelEndpointAutomaticallyDegraded(ENDPOINT, afterExpiryMs)
    ).toBe(false);
    expect(
      await refreshAutomaticallyDegradedModelIds(afterExpiryMs)
    ).not.toContain(ENDPOINT.modelId);
  });

  it("keeps a model degraded while another endpoint remains unhealthy", async () => {
    const endpointExpiresAt = await markModelAutomaticallyDegraded(ENDPOINT);
    await markModelAutomaticallyDegraded(SECOND_ENDPOINT);

    await clearAutomaticModelDegradation(ENDPOINT, endpointExpiresAt);

    expect(await refreshAutomaticallyDegradedModelIds()).toContain(
      ENDPOINT.modelId
    );
  });

  it("does not let delayed recovery clear a newer renewal", async () => {
    const nowMs = Date.now();
    const firstExpiresAt = await markModelAutomaticallyDegraded(
      ENDPOINT,
      nowMs
    );
    const renewedExpiresAt = await markModelAutomaticallyDegraded(
      ENDPOINT,
      nowMs + 1
    );

    expect(await clearAutomaticModelDegradation(ENDPOINT, firstExpiresAt)).toBe(
      false
    );
    expect(renewedExpiresAt.getTime()).toBeGreaterThan(
      firstExpiresAt.getTime()
    );
    expect(
      await isModelEndpointAutomaticallyDegraded(ENDPOINT, nowMs + 1)
    ).toBe(true);
  });

  it("makes repeated renewals idempotent and monotonic", async () => {
    const nowMs = Date.now();
    await markModelAutomaticallyDegraded(ENDPOINT, nowMs);
    const latestExpiresAt = await markModelAutomaticallyDegraded(
      ENDPOINT,
      nowMs + 1
    );
    const records = await ModelDegradationResource.listDegradationRecords({
      source: "automatic",
    });

    expect(
      records.filter(
        (record) =>
          record.modelId === ENDPOINT.modelId &&
          record.providerId === ENDPOINT.providerId &&
          record.host === ENDPOINT.host
      )
    ).toEqual([
      expect.objectContaining({
        expiresAt: latestExpiresAt,
      }),
    ]);
  });

  it("keeps a manual degradation after automatic recovery", async () => {
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...ENDPOINT, degraded: true },
    ]);
    const expiresAt = await markModelAutomaticallyDegraded(ENDPOINT);

    expect(await clearAutomaticModelDegradation(ENDPOINT, expiresAt)).toBe(
      true
    );
    expect(
      await ModelDegradationResource.listDegradedEndpoints()
    ).toContainEqual(ENDPOINT);
  });

  it("exposes automatic source and expiration for operators", async () => {
    const expiresAt = await markModelAutomaticallyDegraded(ENDPOINT);

    expect(
      await ModelDegradationResource.listDegradationRecords({
        source: "automatic",
      })
    ).toEqual([
      expect.objectContaining({
        ...ENDPOINT,
        source: "automatic",
        expiresAt,
      }),
    ]);
  });
});
