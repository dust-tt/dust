import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { evaluateEndpoint, isBreaching } from "@app/lib/api/llm/health/detect";
import {
  ATTEMPTS_FIELD,
  modelHealthKey,
  PROVIDER_ERRORS_FIELD,
} from "@app/lib/api/llm/health/keys";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import { launchModelHealthRecovery } from "@app/temporal/model_health/client";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const NOW = new Date("2026-09-03T14:32:10Z");
const DEGRADED_SINCE_MS = NOW.getTime();

async function seedWindow({
  attempts,
  providerErrors,
}: {
  attempts: number;
  providerErrors: number;
}): Promise<void> {
  const key = modelHealthKey(ENDPOINT, "202609031432");
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
  beforeEach(() => {
    redisMock.reset();
    vi.clearAllMocks();
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Ok({ outcome: "started", degradedSinceMs: DEGRADED_SINCE_MS })
    );
  });

  it("declares a breaching endpoint degraded", async () => {
    await seedWindow({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS });

    expect(await evaluateEndpoint(ENDPOINT, NOW)).toEqual({
      outcome: "recovery_started",
      degradedSinceMs: DEGRADED_SINCE_MS,
    });

    expect(launchModelHealthRecovery).toHaveBeenCalledWith(ENDPOINT);
    expect(logModelHealthTransition).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT, transition: "degraded" })
    );
  });

  it("leaves a healthy endpoint alone", async () => {
    await seedWindow({
      attempts: ATTEMPTS,
      providerErrors: BREACHING_ERRORS - 1,
    });

    expect(await evaluateEndpoint(ENDPOINT, NOW)).toEqual({
      outcome: "not_breaching",
    });

    expect(launchModelHealthRecovery).not.toHaveBeenCalled();
    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });

  it("does not log a transition when the endpoint was already degraded", async () => {
    // Another pod won the race: the workflow already exists, so this is not a
    // state change and must not show up as a second incident.
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Ok({
        outcome: "already_degraded",
        degradedSinceMs: DEGRADED_SINCE_MS,
      })
    );
    await seedWindow({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS });

    expect(await evaluateEndpoint(ENDPOINT, NOW)).toEqual({
      outcome: "already_degraded",
      degradedSinceMs: DEGRADED_SINCE_MS,
    });

    expect(launchModelHealthRecovery).toHaveBeenCalledTimes(1);
    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });

  it("does not claim a transition when the workflow could not be started", async () => {
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Err(new Error("temporal is unreachable"))
    );
    await seedWindow({ attempts: ATTEMPTS, providerErrors: BREACHING_ERRORS });

    expect(await evaluateEndpoint(ENDPOINT, NOW)).toEqual({
      outcome: "launch_failed",
    });

    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });
});
