import { describe, expect, it } from "vitest";

import { DustServerError } from "../errors/errors";
import { createRetry, withRetry } from "./retry";

describe("withRetry", () => {
  it("runs the operation when an option is explicitly undefined", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        return "ok";
      },
      { maxAttempts: undefined }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("falls back to the default backoff when a delay option is undefined", async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new DustServerError("boom");
        }
        return "ok";
      },
      {
        initialDelayMs: 1,
        maxDelayMs: undefined,
        backoffMultiplier: undefined,
        jitterFactor: undefined,
        onRetry: (_error, _attempt, delayMs) => delays.push(delayMs),
      }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(0);
    expect(delays[0]).toBeLessThanOrEqual(2);
  });

  it("keeps a createRetry default when the call option is undefined", async () => {
    const retry = createRetry({ maxAttempts: 2, initialDelayMs: 1 });
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls += 1;
          throw new DustServerError("boom");
        },
        { maxAttempts: undefined }
      )
    ).rejects.toBeInstanceOf(DustServerError);

    expect(calls).toBe(2);
  });
});
