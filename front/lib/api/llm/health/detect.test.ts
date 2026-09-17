import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { evaluateEndpoint, isBreaching } from "@app/lib/api/llm/health/detect";
import {
  ATTEMPTS_FIELD,
  minuteBucket,
  modelHealthKey,
  PROVIDER_ERRORS_FIELD,
} from "@app/lib/api/llm/health/keys";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import type { Authenticator } from "@app/lib/auth";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { launchModelHealthRecovery } from "@app/temporal/model_health/client";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/model_health/client", () => ({
  launchModelHealthRecovery: vi.fn(),
}));

vi.mock("@app/lib/api/llm/health/transitions", () => ({
  logModelHealthTransition: vi.fn(),
}));

const ENDPOINT = {
  modelId: "claude-sonnet-5",
  providerId: "anthropic",
  host: "anthropic",
} as const;

// Just enough attempts to clear the volume floor, so only the ratio decides,
// and the fewest errors that breach on them.
const ATTEMPTS = MIN_ATTEMPTS_IN_WINDOW;
const BREACHING_ERRORS = Math.ceil(ATTEMPTS * ERROR_RATIO_THRESHOLD);

const NOW = new Date();
const DEGRADED_SINCE_MS = NOW.getTime();
let AUTH: Authenticator;

async function seedWindow({
  attempts,
  providerErrors,
}: {
  attempts: number;
  providerErrors: number;
}): Promise<void> {
  const key = modelHealthKey(ENDPOINT, minuteBucket(NOW));
  await redisMock.cacheClient.hIncrBy(key, ATTEMPTS_FIELD, attempts);
  await redisMock.cacheClient.hIncrBy(
    key,
    PROVIDER_ERRORS_FIELD,
    providerErrors
  );
}

describe("isBreaching", () => {
  it("ignores an endpoint below the volume floor, however bad the ratio", () => {
    // 100% errors, but one attempt short of the floor the ratio is noise.
    const attempts = MIN_ATTEMPTS_IN_WINDOW - 1;
    expect(isBreaching({ attempts, providerErrors: attempts })).toBe(false);
  });

  it("breaches at the threshold", () => {
    expect(
      isBreaching({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS })
    ).toBe(true);
  });

  it("does not breach just below it", () => {
    expect(
      isBreaching({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS - 1 })
    ).toBe(false);
  });

  it("treats an idle endpoint as healthy", () => {
    expect(isBreaching({ attempts: 0, providerErrors: 0 })).toBe(false);
  });
});

describe("evaluateEndpoint", () => {
  afterEach(async () => {
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...ENDPOINT, degraded: false },
    ]);
  });

  async function isEndpointDegraded(): Promise<boolean> {
    return (await ModelDegradationResource.listDegradedEndpoints()).some(
      (endpoint) =>
        endpoint.modelId === ENDPOINT.modelId &&
        endpoint.providerId === ENDPOINT.providerId &&
        endpoint.host === ENDPOINT.host
    );
  }

  beforeEach(async () => {
    redisMock.reset();
    const { authenticator } = await createResourceTest({ role: "admin" });
    AUTH = authenticator;
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Ok({ outcome: "started", degradedSinceMs: DEGRADED_SINCE_MS })
    );
  });

  it("declares a breaching endpoint degraded", async () => {
    await FeatureFlagFactory.basic(AUTH, "automatic_model_health_routing");
    await seedWindow({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS });

    expect(await evaluateEndpoint(ENDPOINT, AUTH, NOW)).toEqual({
      outcome: "recovery_started",
      degradedSinceMs: DEGRADED_SINCE_MS,
    });

    expect(launchModelHealthRecovery).toHaveBeenCalledWith(ENDPOINT, true);
    expect(await isEndpointDegraded()).toBe(true);
    expect(logModelHealthTransition).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT, transition: "degraded" })
    );
  });

  it("detects a breach without persisting it when routing is disabled", async () => {
    await seedWindow({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS });

    expect(await evaluateEndpoint(ENDPOINT, AUTH, NOW)).toEqual({
      outcome: "recovery_started",
      degradedSinceMs: DEGRADED_SINCE_MS,
    });

    expect(launchModelHealthRecovery).toHaveBeenCalledWith(ENDPOINT, false);
    expect(await isEndpointDegraded()).toBe(false);
    expect(logModelHealthTransition).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      transition: "degraded",
      window: {
        attempts: ATTEMPTS,
        providerErrors: BREACHING_ERRORS,
      },
      expiresAt: undefined,
    });
  });

  it("leaves a healthy endpoint alone", async () => {
    await seedWindow({
      attempts: ATTEMPTS,
      providerErrors: BREACHING_ERRORS - 1,
    });

    expect(await evaluateEndpoint(ENDPOINT, AUTH, NOW)).toEqual({
      outcome: "not_breaching",
    });

    expect(launchModelHealthRecovery).not.toHaveBeenCalled();
    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });

  it("does not log a transition when the endpoint was already degraded", async () => {
    // Another pod won the race: the workflow already exists, so this is not a
    // state change and must not show up as a second incident.
    await FeatureFlagFactory.basic(AUTH, "automatic_model_health_routing");
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Ok({
        outcome: "already_degraded",
        degradedSinceMs: DEGRADED_SINCE_MS,
      })
    );
    await seedWindow({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS });

    expect(await evaluateEndpoint(ENDPOINT, AUTH, NOW)).toEqual({
      outcome: "already_degraded",
      degradedSinceMs: DEGRADED_SINCE_MS,
    });

    expect(launchModelHealthRecovery).toHaveBeenCalledTimes(1);
    expect(await isEndpointDegraded()).toBe(true);
    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });

  it("does not claim a transition when the workflow could not be started", async () => {
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Err(new Error("temporal is unreachable"))
    );
    await seedWindow({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS });

    expect(await evaluateEndpoint(ENDPOINT, AUTH, NOW)).toEqual({
      outcome: "launch_failed",
    });

    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });
});
