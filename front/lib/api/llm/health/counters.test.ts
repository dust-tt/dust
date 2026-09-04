import { recordLLMAttempt } from "@app/lib/api/llm/health/counters";
import { modelHealthKey } from "@app/lib/api/llm/health/keys";
import type { LLMAttemptOutcomeTelemetry } from "@app/lib/api/llm/telemetry";
import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import { runOnRedisCache } from "@app/lib/api/redis";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});
