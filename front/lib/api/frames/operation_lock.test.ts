import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
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

  it("keeps zero-argument publish callbacks compatible", async () => {
    getRedisStreamClientMock.mockResolvedValue(makeRedisClient());

    const result = await withFramePublishLock(
      "frame-123",
      async () => new Ok("published")
    );

    expect(result.isOk() && result.value).toBe("published");
  });
});
