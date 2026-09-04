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

const NOW = new Date("2026-09-03T14:32:10Z");

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
    // 100% errors, but on 199 attempts the ratio is noise.
    expect(isBreaching({ attempts: 199, providerErrors: 199 })).toBe(false);
  });

  it("breaches at the threshold", () => {
    expect(isBreaching({ attempts: 200, providerErrors: 40 })).toBe(true);
  });

  it("does not breach just below it", () => {
    expect(isBreaching({ attempts: 200, providerErrors: 39 })).toBe(false);
  });

  it("treats an idle endpoint as healthy", () => {
    expect(isBreaching({ attempts: 0, providerErrors: 0 })).toBe(false);
  });
});

describe("evaluateEndpoint", () => {
  beforeEach(() => {
    redisMock.reset();
    vi.clearAllMocks();
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(new Ok("started"));
  });

  it("declares a breaching endpoint degraded", async () => {
    await seedWindow({ attempts: 250, providerErrors: 60 });

    await evaluateEndpoint(ENDPOINT, NOW);

    expect(launchModelHealthRecovery).toHaveBeenCalledWith(ENDPOINT);
    expect(logModelHealthTransition).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT, transition: "degraded" })
    );
  });

  it("leaves a healthy endpoint alone", async () => {
    await seedWindow({ attempts: 250, providerErrors: 10 });

    await evaluateEndpoint(ENDPOINT, NOW);

    expect(launchModelHealthRecovery).not.toHaveBeenCalled();
    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });

  it("does not log a transition when the endpoint was already degraded", async () => {
    // Another pod won the race: the workflow already exists, so this is not a
    // state change and must not show up as a second incident.
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Ok("already_degraded")
    );
    await seedWindow({ attempts: 250, providerErrors: 60 });

    await evaluateEndpoint(ENDPOINT, NOW);

    expect(launchModelHealthRecovery).toHaveBeenCalledTimes(1);
    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });

  it("does not claim a transition when the workflow could not be started", async () => {
    vi.mocked(launchModelHealthRecovery).mockResolvedValue(
      new Err(new Error("temporal is unreachable"))
    );
    await seedWindow({ attempts: 250, providerErrors: 60 });

    await evaluateEndpoint(ENDPOINT, NOW);

    expect(logModelHealthTransition).not.toHaveBeenCalled();
  });
});
