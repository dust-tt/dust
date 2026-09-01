import type { RedisClientType } from "@app/lib/api/redis";
import { distributedRefresh } from "@app/lib/lock";
import { describe, expect, it, vi } from "vitest";

type LockRedisClient = Pick<RedisClientType, "eval" | "set">;

function makeRedisClient(): LockRedisClient {
  return {
    eval: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue("OK"),
  };
}

describe("distributedRefresh", () => {
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
});
