import {
  getFramePublishLockName,
  getFrameSourceLockName,
  getLegacyFrameMutationLockName,
  withFrameSourceLock,
  withLegacyFrameMutationLock,
} from "@app/lib/api/frames/operation_lock";
import type { RedisClientType } from "@app/lib/api/redis";
import { Ok } from "@app/types/shared/result";
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

describe("Frame operation locks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses a distinct source-operation lock namespace", async () => {
    const redis = makeRedisClient();
    getRedisStreamClientMock.mockResolvedValue(redis);

    const result = await withFrameSourceLock(
      "frame-123",
      async () => new Ok("moved")
    );

    expect(result.isOk() && result.value).toBe("moved");
    expect(getFrameSourceLockName("frame-123")).toBe("frame:source:frame-123");
    expect(getFrameSourceLockName("frame-123")).not.toBe(
      getFramePublishLockName("frame-123")
    );
    expect(redis.set).toHaveBeenCalledWith(
      "lock:frame:source:frame-123",
      expect.any(String),
      expect.objectContaining({ PX: 10 * 60_000 })
    );
  });

  it("keeps every legacy Frame mutation serialized beyond five seconds", async () => {
    let lock: { expiresAt: number; value: string } | null = null;
    const redis = {
      eval: vi.fn(
        async (
          _script: string,
          { arguments: [value] }: { arguments: string[] }
        ) => {
          if (lock?.value === value) {
            lock = null;
          }
          return 1;
        }
      ),
      set: vi.fn(
        async (_key: string, value: string, { PX: ttlMs }: { PX: number }) => {
          if (lock && lock.expiresAt > Date.now()) {
            return null;
          }
          lock = { expiresAt: Date.now() + ttlMs, value };
          return "OK";
        }
      ),
    } as unknown as LockRedisClient;
    getRedisStreamClientMock.mockResolvedValue(redis);

    let releaseFirst!: () => void;
    const first = withLegacyFrameMutationLock(
      "frame-123",
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve("first");
        })
    );
    await vi.advanceTimersByTimeAsync(5_500);

    let secondEntered = false;
    const second = withLegacyFrameMutationLock("frame-123", async () => {
      secondEntered = true;
      return "second";
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(secondEntered).toBe(false);
    expect(getLegacyFrameMutationLockName("frame-123")).toBe(
      "file:edit:frame-123"
    );
    releaseFirst();
    await expect(first).resolves.toBe("first");
    await vi.advanceTimersByTimeAsync(100);
    await expect(second).resolves.toBe("second");
  });
});
