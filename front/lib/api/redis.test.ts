import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/api/redis");

vi.mock("redis", () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    info: vi.fn(),
  },
}));

vi.mock("@app/logger/statsDClient", () => ({
  statsDClient: {
    increment: vi.fn(),
    decrement: vi.fn(),
  },
}));

describe("getRedisStreamClient", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.REDIS_URI = "redis://localhost:6379";
    process.env.REDIS_CACHE_URI = "redis://localhost:6380";
  });

  afterEach(async () => {
    const { closeRedisClients } = await import("./redis");
    await closeRedisClients();
    vi.clearAllMocks();
  });

  it("returns same client on repeated calls", async () => {
    const { getRedisStreamClient } = await import("./redis");
    const client1 = await getRedisStreamClient({ origin: "lock" });
    const client2 = await getRedisStreamClient({ origin: "agent_usage" });
    expect(client1).toBe(client2);
  });

  it("throws when REDIS_URI not defined", async () => {
    delete process.env.REDIS_URI;
    const { getRedisStreamClient } = await import("./redis");
    await expect(getRedisStreamClient({ origin: "lock" })).rejects.toThrow(
      "REDIS_URI is required but not set"
    );
  });
});

describe("getRedisCacheClient", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.REDIS_URI = "redis://localhost:6379";
    process.env.REDIS_CACHE_URI = "redis://localhost:6380";
  });

  afterEach(async () => {
    const { closeRedisClients } = await import("./redis");
    await closeRedisClients();
    vi.clearAllMocks();
  });

  it("returns same client on repeated calls", async () => {
    const { getRedisCacheClient } = await import("./redis");
    const client1 = await getRedisCacheClient({ origin: "cache_with_redis" });
    const client2 = await getRedisCacheClient({ origin: "cache_with_redis" });
    expect(client1).toBe(client2);
  });

  it("returns different client than stream client", async () => {
    const { getRedisStreamClient, getRedisCacheClient } = await import(
      "./redis"
    );
    const streamClient = await getRedisStreamClient({ origin: "lock" });
    const cacheClient = await getRedisCacheClient({
      origin: "cache_with_redis",
    });
    expect(streamClient).not.toBe(cacheClient);
  });

  it("throws when REDIS_CACHE_URI not defined", async () => {
    delete process.env.REDIS_CACHE_URI;
    const { getRedisCacheClient } = await import("./redis");
    await expect(
      getRedisCacheClient({ origin: "cache_with_redis" })
    ).rejects.toThrow("REDIS_CACHE_URI is required but not set");
  });
});

describe("closeRedisClients", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.REDIS_URI = "redis://localhost:6379";
    process.env.REDIS_CACHE_URI = "redis://localhost:6380";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("closes all cached clients", async () => {
    const { getRedisStreamClient, getRedisCacheClient, closeRedisClients } =
      await import("./redis");
    const streamClient = await getRedisStreamClient({ origin: "lock" });
    const cacheClient = await getRedisCacheClient({
      origin: "cache_with_redis",
    });
    await closeRedisClients();
    expect(streamClient.quit).toHaveBeenCalled();
    expect(cacheClient.quit).toHaveBeenCalled();
  });

  it("allows new clients after close", async () => {
    const redis = await import("./redis");
    await redis.getRedisStreamClient({ origin: "lock" });
    await redis.closeRedisClients();
    const { createClient } = await import("redis");
    vi.mocked(createClient).mockClear();
    await redis.getRedisStreamClient({ origin: "lock" });
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});

describe("runOnRedis", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.REDIS_URI = "redis://localhost:6379";
  });

  afterEach(async () => {
    const { closeRedisClients } = await import("./redis");
    await closeRedisClients();
    vi.clearAllMocks();
  });

  it("uses stream client", async () => {
    const { getRedisStreamClient, runOnRedis } = await import("./redis");
    const streamClient = await getRedisStreamClient({ origin: "lock" });
    const result = await runOnRedis({ origin: "lock" }, async (client) => {
      expect(client).toBe(streamClient);
      return "result";
    });
    expect(result).toBe("result");
  });
});

describe("runOnRedisCache", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.REDIS_CACHE_URI = "redis://localhost:6380";
  });

  afterEach(async () => {
    const { closeRedisClients } = await import("./redis");
    await closeRedisClients();
    vi.clearAllMocks();
  });

  it("uses cache client", async () => {
    const { getRedisCacheClient, runOnRedisCache } = await import("./redis");
    const cacheClient = await getRedisCacheClient({
      origin: "cache_with_redis",
    });
    const result = await runOnRedisCache(
      { origin: "cache_with_redis" },
      async (client) => {
        expect(client).toBe(cacheClient);
        return "result";
      }
    );
    expect(result).toBe("result");
  });
});
