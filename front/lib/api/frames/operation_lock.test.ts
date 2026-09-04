import {
  getFramePublishLockName,
  getFrameSourceLockName,
  getFrameWorkspaceSourceLockName,
  withFrameSourceLock,
  withFrameWorkspaceSourceLock,
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

  it("serializes source path mutations within a workspace", async () => {
    const redis = makeRedisClient();
    getRedisStreamClientMock.mockResolvedValue(redis);

    const result = await withFrameWorkspaceSourceLock(
      "workspace-123",
      async () => new Ok("moved")
    );

    expect(result.isOk() && result.value).toBe("moved");
    expect(getFrameWorkspaceSourceLockName("workspace-123")).toBe(
      "frame:source-workspace:workspace-123"
    );
    expect(redis.set).toHaveBeenCalledWith(
      "lock:frame:source-workspace:workspace-123",
      expect.any(String),
      expect.objectContaining({ PX: 10 * 60_000 })
    );
  });
});
