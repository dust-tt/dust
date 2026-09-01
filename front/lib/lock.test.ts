import type { RedisClientType } from "@app/lib/api/redis";
import {
  distributedRefresh,
  executeWithRenewingLockResult,
  isLockLeaseLostError,
} from "@app/lib/lock";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LockRedisClient = Pick<RedisClientType, "eval" | "set">;
const { getRedisStreamClientMock } = vi.hoisted(() => ({
  getRedisStreamClientMock: vi.fn<() => Promise<LockRedisClient>>(),
}));

vi.mock("@app/lib/api/redis", () => ({
  getRedisStreamClient: getRedisStreamClientMock,
}));

function makeRedisClient(): LockRedisClient {
  return {
    eval: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue("OK"),
  };
}

describe("renewing locks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes only the lock owned by the caller", async () => {
    const redisClient = makeRedisClient();

    await expect(
      distributedRefresh(redisClient, "frame:source:123", "owner-token", 900)
    ).resolves.toBe(true);

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("pexpire", KEYS[1], ARGV[2])'),
      {
        keys: ["lock:frame:source:123"],
        arguments: ["owner-token", "900"],
      }
    );

    vi.mocked(redisClient.eval).mockResolvedValueOnce(0);
    await expect(
      distributedRefresh(redisClient, "frame:source:123", "old-owner", 900)
    ).resolves.toBe(false);
  });

  it("does not overlap renewal requests", async () => {
    const redisClient = makeRedisClient();
    let finishRefresh: (value: number) => void = () => {};
    const pendingRefresh = new Promise<number>((resolve) => {
      finishRefresh = resolve;
    });
    vi.mocked(redisClient.eval)
      .mockImplementationOnce(() => pendingRefresh)
      .mockResolvedValue(1);
    getRedisStreamClientMock.mockResolvedValue(redisClient);
    let finishCallback: () => void = () => {};
    const callbackDone = new Promise<void>((resolve) => {
      finishCallback = resolve;
    });

    const resultPromise = executeWithRenewingLockResult(
      "frame:source:123",
      async () => {
        await callbackDone;
        return new Ok("done");
      },
      1_000,
      { lockTtlMs: 90 }
    );

    await vi.advanceTimersByTimeAsync(30);
    expect(redisClient.eval).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(redisClient.eval).toHaveBeenCalledTimes(1);

    finishRefresh(1);
    await vi.advanceTimersByTimeAsync(30);
    expect(redisClient.eval).toHaveBeenCalledTimes(2);
    finishCallback();
    await resultPromise;
  });

  it("observes an in-flight definitive loss before returning", async () => {
    const redisClient = makeRedisClient();
    let finishRefresh: (value: number) => void = () => {};
    const pendingRefresh = new Promise<number>((resolve) => {
      finishRefresh = resolve;
    });
    vi.mocked(redisClient.eval)
      .mockImplementationOnce(() => pendingRefresh)
      .mockResolvedValue(1);
    getRedisStreamClientMock.mockResolvedValue(redisClient);
    let finishCallback: () => void = () => {};
    const callbackDone = new Promise<void>((resolve) => {
      finishCallback = resolve;
    });

    const resultPromise = executeWithRenewingLockResult(
      "frame:source:123",
      async () => {
        await callbackDone;
        return new Ok("done");
      },
      1_000,
      { lockTtlMs: 90 }
    );

    await vi.advanceTimersByTimeAsync(30);
    finishCallback();
    await vi.advanceTimersByTimeAsync(0);
    finishRefresh(0);
    const result = await resultPromise;

    expect(result.isErr() && isLockLeaseLostError(result.error)).toBe(true);
  });

  it("fails the lease when refresh errors", async () => {
    const redisClient = makeRedisClient();
    vi.mocked(redisClient.eval).mockRejectedValue(
      new Error("redis unavailable")
    );
    getRedisStreamClientMock.mockResolvedValue(redisClient);

    const resultPromise = executeWithRenewingLockResult(
      "frame:source:123",
      async () => {
        await vi.advanceTimersByTimeAsync(30);
        return new Ok("callback-completed");
      },
      1_000,
      { lockTtlMs: 90 }
    );
    const result = await resultPromise;

    expect(result.isErr() && isLockLeaseLostError(result.error)).toBe(true);
  });

  it("fails the lease immediately when Redis reports a different owner", async () => {
    const redisClient = makeRedisClient();
    vi.mocked(redisClient.eval).mockResolvedValue(0);
    getRedisStreamClientMock.mockResolvedValue(redisClient);

    const resultPromise = executeWithRenewingLockResult(
      "frame:source:123",
      async () => {
        await vi.advanceTimersByTimeAsync(30);
        return new Err(new Error("callback failed too"));
      },
      1_000,
      { lockTtlMs: 90 }
    );
    const result = await resultPromise;

    expect(result.isErr() && isLockLeaseLostError(result.error)).toBe(true);
  });

  it("stops renewal before unlocking", async () => {
    const redisClient = makeRedisClient();
    const scripts: string[] = [];
    vi.mocked(redisClient.eval).mockImplementation((...args) => {
      scripts.push(String(typeof args[0] === "string" ? args[0] : args[1]));
      return Promise.resolve(1);
    });
    getRedisStreamClientMock.mockResolvedValue(redisClient);

    const resultPromise = executeWithRenewingLockResult(
      "frame:source:123",
      async () => {
        await vi.advanceTimersByTimeAsync(30);
        return new Ok("done");
      },
      1_000,
      { lockTtlMs: 90 }
    );
    await resultPromise;
    await vi.advanceTimersByTimeAsync(300);

    expect(scripts.filter((script) => script.includes("pexpire"))).toHaveLength(
      1
    );
    expect(scripts.at(-1)).toContain('redis.call("del", KEYS[1])');
  });
});
