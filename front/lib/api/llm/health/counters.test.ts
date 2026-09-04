import { MIN_EVALUATION_INTERVAL_MS } from "@app/lib/api/llm/health/config";
import { recordLLMAttempt } from "@app/lib/api/llm/health/counters";
import { evaluateEndpoint } from "@app/lib/api/llm/health/detect";
import { modelHealthKey } from "@app/lib/api/llm/health/keys";
import type { LLMAttemptOutcomeTelemetry } from "@app/lib/api/llm/telemetry";
import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import { runOnRedisCache } from "@app/lib/api/redis";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Detection is exercised on its own; here we only care about when it is asked
// for, so it never reaches Redis.
vi.mock("@app/lib/api/llm/health/detect", () => ({
  evaluateEndpoint: vi.fn().mockResolvedValue(undefined),
}));

const ENDPOINT = {
  modelId: "claude-sonnet-5",
  providerId: "anthropic",
  host: "anthropic",
} as const;

const SUCCESS = { outcome: "success" } as const;

function providerError(errorType: LLMErrorType) {
  return { outcome: "error", errorSource: "provider", errorType } as const;
}

const NOW = new Date("2026-09-03T14:32:10Z");
const KEY = modelHealthKey(ENDPOINT, "202609031432");

async function record(outcome: LLMAttemptOutcomeTelemetry): Promise<void> {
  await recordLLMAttempt({ endpoint: ENDPOINT, outcome, now: NOW });
}

describe("model health counters", () => {
  beforeEach(() => {
    redisMock.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates attempts and provider errors into one hash", async () => {
    await record(SUCCESS);
    await record(SUCCESS);
    await record(providerError("overloaded_error"));
    await record(providerError("overloaded_error"));
    await record(providerError("server_error"));

    expect(await redisMock.cacheClient.hGetAll(KEY)).toEqual({
      attempts: "5",
      error_provider: "3",
    });
  });

  it("counts a dust-attributed failure as an attempt but not as an error", async () => {
    // The numerator is provider-attributed outages only: a 429 we raised or a
    // malformed request says nothing about the provider's health.
    await record({
      outcome: "error",
      errorSource: "dust",
      errorType: "rate_limit_error",
    });

    const hash = await redisMock.cacheClient.hGetAll(KEY);
    expect(hash.attempts).toBe("1");
    expect(hash.error_provider).toBeUndefined();
  });

  it("sets a TTL so counters expire on their own", async () => {
    await record(SUCCESS);

    expect(redisMock.cacheClient.expire).toHaveBeenCalledWith(
      KEY,
      expect.any(Number)
    );
  });

  it("adds to what other pods already wrote rather than overwriting it", async () => {
    await redisMock.cacheClient.hIncrBy(KEY, "attempts", 100);

    await record(SUCCESS);

    expect((await redisMock.cacheClient.hGetAll(KEY)).attempts).toBe("101");
  });

  it("writes each attempt into the bucket of its own minute", async () => {
    await record(SUCCESS);
    await recordLLMAttempt({
      endpoint: ENDPOINT,
      outcome: SUCCESS,
      now: new Date("2026-09-03T14:33:01Z"),
    });

    expect((await redisMock.cacheClient.hGetAll(KEY)).attempts).toBe("1");
    expect(
      (
        await redisMock.cacheClient.hGetAll(
          modelHealthKey(ENDPOINT, "202609031433")
        )
      ).attempts
    ).toBe("1");
  });

  it("ignores the noop endpoint", async () => {
    await recordLLMAttempt({
      endpoint: { modelId: "noop", providerId: "noop", host: "noop" },
      outcome: providerError("server_error"),
      now: NOW,
    });

    expect(runOnRedisCache).not.toHaveBeenCalled();
  });

  it("swallows a failed write rather than surfacing it to the caller", async () => {
    vi.mocked(runOnRedisCache).mockRejectedValueOnce(
      new Error("redis is down")
    );

    // Never rejects: callers `void` this, so a rejection would be an unhandled
    // one on the request path.
    await expect(
      record(providerError("server_error"))
    ).resolves.toBeUndefined();

    // The lost attempt is not replayed; the next one writes on its own.
    await record(SUCCESS);

    expect((await redisMock.cacheClient.hGetAll(KEY)).attempts).toBe("1");
  });

  it("evaluates the endpoint it just wrote, and only on a provider error", async () => {
    // The throttle is module state keyed by endpoint, so each of these tests
    // takes a model of its own.
    const endpoint = { ...ENDPOINT, modelId: "claude-opus-5" } as const;

    await recordLLMAttempt({ endpoint, outcome: SUCCESS, now: NOW });
    expect(evaluateEndpoint).not.toHaveBeenCalled();

    await recordLLMAttempt({
      endpoint,
      outcome: providerError("overloaded_error"),
      now: NOW,
    });
    expect(evaluateEndpoint).toHaveBeenCalledWith(endpoint, NOW);
  });

  it("evaluates one endpoint at most once per interval", async () => {
    const endpoint = { ...ENDPOINT, modelId: "claude-opus-4-8" } as const;
    const error = providerError("overloaded_error");

    // An outage puts hundreds of these a second on the same endpoint; they must
    // not each read the window and hand Temporal a duplicate start.
    await recordLLMAttempt({ endpoint, outcome: error, now: NOW });
    await recordLLMAttempt({ endpoint, outcome: error, now: NOW });
    await recordLLMAttempt({
      endpoint,
      outcome: error,
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(evaluateEndpoint).toHaveBeenCalledTimes(1);

    const laterMs = NOW.getTime() + MIN_EVALUATION_INTERVAL_MS;
    await recordLLMAttempt({
      endpoint,
      outcome: error,
      now: new Date(laterMs),
    });
    expect(evaluateEndpoint).toHaveBeenCalledTimes(2);
  });

  it("does not evaluate when the write failed", async () => {
    const endpoint = {
      ...ENDPOINT,
      modelId: "claude-haiku-4-5-20251001",
    } as const;
    vi.mocked(runOnRedisCache).mockRejectedValueOnce(
      new Error("redis is down")
    );

    await recordLLMAttempt({
      endpoint,
      outcome: providerError("server_error"),
      now: NOW,
    });

    expect(evaluateEndpoint).not.toHaveBeenCalled();
  });
});
