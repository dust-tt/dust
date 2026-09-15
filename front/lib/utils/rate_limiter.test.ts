import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.unmock("@app/lib/api/redis");

vi.mock("@app/lib/utils/statsd", () => ({
  statsDMetrics: {
    decrement: vi.fn(),
    distribution: vi.fn(),
    increment: vi.fn(),
  },
}));

const logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
};

const keysToExpire = new Set<string>();

type RedisModule = typeof import("@app/lib/api/redis");
type RateLimiterModule = typeof import("@app/lib/utils/rate_limiter");
type StatsModule = typeof import("@app/lib/utils/statsd");

let closeRedisClients: RedisModule["closeRedisClients"];
let runOnRedis: RedisModule["runOnRedis"];
let addRateLimiterCount: RateLimiterModule["addRateLimiterCount"];
let expireRateLimiterKey: RateLimiterModule["expireRateLimiterKey"];
let getRateLimiterCount: RateLimiterModule["getRateLimiterCount"];
let getRateLimiterTimestamps: RateLimiterModule["getRateLimiterTimestamps"];
let getWeightedRateLimiterCount: RateLimiterModule["getWeightedRateLimiterCount"];
let getWeightedRateLimiterUsage: RateLimiterModule["getWeightedRateLimiterUsage"];
let rateLimiter: RateLimiterModule["rateLimiter"];
let reportRedisCounterError: RateLimiterModule["reportRedisCounterError"];
let RATE_LIMITER_PREFIX: RateLimiterModule["RATE_LIMITER_PREFIX"];
let addFixedWindowCount: RateLimiterModule["addFixedWindowCount"];
let getFixedWindowCount: RateLimiterModule["getFixedWindowCount"];
let statsDMetrics: StatsModule["statsDMetrics"];

async function expireTestKey(key: string) {
  keysToExpire.add(key);
  await expireRateLimiterKey({ key });
}

describe("rateLimiter", () => {
  beforeAll(async () => {
    const redisModule = await import("@app/lib/api/redis");
    const rateLimiterModule = await import("@app/lib/utils/rate_limiter");
    const statsModule = await import("@app/lib/utils/statsd");

    closeRedisClients = redisModule.closeRedisClients;
    runOnRedis = redisModule.runOnRedis;
    addRateLimiterCount = rateLimiterModule.addRateLimiterCount;
    expireRateLimiterKey = rateLimiterModule.expireRateLimiterKey;
    getRateLimiterCount = rateLimiterModule.getRateLimiterCount;
    getRateLimiterTimestamps = rateLimiterModule.getRateLimiterTimestamps;
    RATE_LIMITER_PREFIX = rateLimiterModule.RATE_LIMITER_PREFIX;
    rateLimiter = rateLimiterModule.rateLimiter;
    reportRedisCounterError = rateLimiterModule.reportRedisCounterError;
    statsDMetrics = statsModule.statsDMetrics;
  });

  afterEach(async () => {
    await Promise.all(
      [...keysToExpire].map((key) => expireRateLimiterKey({ key }))
    );
    keysToExpire.clear();
  });

  afterAll(async () => {
    await closeRedisClients();
  });

  it("keeps the existing consume-one behavior", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    await expect(
      rateLimiter({
        key,
        maxPerTimeframe: 2,
        timeframeSeconds: 60,
        logger,
      })
    ).resolves.toBe(2);

    await expect(
      rateLimiter({
        key,
        maxPerTimeframe: 2,
        timeframeSeconds: 60,
        logger,
      })
    ).resolves.toBe(1);

    await expect(
      rateLimiter({
        key,
        maxPerTimeframe: 2,
        timeframeSeconds: 60,
        logger,
      })
    ).resolves.toBe(0);
  });

  it("reports Redis counter failures through the shared alert", () => {
    const error = new Error("Redis unavailable");
    const errorLogger = { ...logger, error: vi.fn() };

    reportRedisCounterError({
      operation: "test_operation",
      error,
      context: { key: "test-key" },
      logger: errorLogger,
    });

    expect(statsDMetrics.increment).toHaveBeenCalledWith(
      "ratelimiter.error.count",
      1,
      ["operation:test_operation"]
    );
    expect(errorLogger.error).toHaveBeenCalledWith(
      { key: "test-key", operation: "test_operation", error },
      "Redis counter operation failed"
    );
  });

  it("can consume more than one unit atomically", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    const remaining = await rateLimiter({
      key,
      maxPerTimeframe: 5,
      timeframeSeconds: 60,
      incrementBy: 3,
      logger,
    });
    expect(remaining).toBe(5);

    const count = await getRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(3);
    }

    const blocked = await rateLimiter({
      key,
      maxPerTimeframe: 5,
      timeframeSeconds: 60,
      incrementBy: 3,
      logger,
    });
    expect(blocked).toBe(0);

    const countAfterBlockedIncrement = await getRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(countAfterBlockedIncrement.isOk()).toBe(true);
    if (countAfterBlockedIncrement.isOk()) {
      expect(countAfterBlockedIncrement.value).toBe(3);
    }
  });

  it("allows a zero limit to block all consumption", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    const remaining = await rateLimiter({
      key,
      maxPerTimeframe: 0,
      timeframeSeconds: 60,
      logger,
    });
    expect(remaining).toBe(0);
  });

  it("can read usage without creating the key", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    const count = await getRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(0);
    }

    const exists = await runOnRedis({ origin: "rate_limiter" }, async (redis) =>
      redis.exists(`${RATE_LIMITER_PREFIX}:${key}`)
    );
    expect(exists).toBe(0);
  });

  it("reads usage after consuming multiple units", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    await rateLimiter({
      key,
      maxPerTimeframe: 5,
      timeframeSeconds: 60,
      incrementBy: 3,
      logger,
    });

    const count = await getRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(3);
    }
  });

  it("counts plain Redis members as one unit", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);
    const redisKey = `${RATE_LIMITER_PREFIX}:${key}`;

    await runOnRedis({ origin: "rate_limiter" }, async (redis) =>
      redis.zAdd(redisKey, {
        score: Date.now(),
        value: crypto.randomUUID(),
      })
    );

    const count = await getRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(1);
    }
  });

  it("returns timestamps inside the rolling window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);
    const redisKey = `${RATE_LIMITER_PREFIX}:${key}`;
    const nowMs = Date.now();
    const recentTimestampMs = nowMs - 30_000;

    await runOnRedis({ origin: "rate_limiter" }, async (redis) =>
      redis.zAdd(redisKey, [
        { score: nowMs - 90_000, value: crypto.randomUUID() },
        { score: recentTimestampMs, value: crypto.randomUUID() },
      ])
    );

    const timestamps = await getRateLimiterTimestamps({
      key,
      timeframeSeconds: 60,
    });

    expect(timestamps.isOk()).toBe(true);
    if (timestamps.isOk()) {
      expect(timestamps.value).toEqual([recentTimestampMs]);
    }
  });
});

describe("addRateLimiterCount", () => {
  beforeAll(async () => {
    const redisModule = await import("@app/lib/api/redis");
    const rateLimiterModule = await import("@app/lib/utils/rate_limiter");

    closeRedisClients = redisModule.closeRedisClients;
    runOnRedis = redisModule.runOnRedis;
    addRateLimiterCount = rateLimiterModule.addRateLimiterCount;
    expireRateLimiterKey = rateLimiterModule.expireRateLimiterKey;
    getWeightedRateLimiterCount = rateLimiterModule.getWeightedRateLimiterCount;
    getWeightedRateLimiterUsage = rateLimiterModule.getWeightedRateLimiterUsage;
    RATE_LIMITER_PREFIX = rateLimiterModule.RATE_LIMITER_PREFIX;
  });

  afterEach(async () => {
    await Promise.all(
      [...keysToExpire].map((key) => expireRateLimiterKey({ key }))
    );
    keysToExpire.clear();
  });

  afterAll(async () => {
    await closeRedisClients();
  });

  it("stores a fractional credit amount as integer microCredits", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    await addRateLimiterCount({
      key,
      timeframeSeconds: 60,
      incrementBy: 2.5,
      logger,
    });

    const count = await getWeightedRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(2_500_000);
    }
  });

  it("sums the amount of multiple entries, even past what a limit-guarded write would allow", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    // Reproduces the fair-use AWU bug: count is already at 9/10, and the message that just ran
    // cost 2 credits. A limit-guarded `rateLimiter` write would silently drop this because
    // 9 + 2 > 10; `addRateLimiterCount` must persist all of it regardless.
    await addRateLimiterCount({
      key,
      timeframeSeconds: 60,
      incrementBy: 9,
      logger,
    });
    await addRateLimiterCount({
      key,
      timeframeSeconds: 60,
      incrementBy: 2.5,
      logger,
    });

    const count = await getWeightedRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(11_500_000);
    }
  });

  it("excludes entries outside the rolling window from the sum", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);
    const redisKey = `${RATE_LIMITER_PREFIX}:${key}`;

    // A recent entry (inside a 60s window) and a stale one (2 hours old, outside
    // it). Stale entries are written directly with an old score so the sum can
    // be asserted deterministically.
    await addRateLimiterCount({
      key,
      timeframeSeconds: 60,
      incrementBy: 3,
      logger,
    });
    await runOnRedis({ origin: "rate_limiter" }, async (redis) =>
      redis.zAdd(redisKey, {
        score: Date.now() - 2 * 60 * 60 * 1000,
        value: `5000000:${crypto.randomUUID()}`,
      })
    );

    const count = await getWeightedRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(3_000_000);
    }
  });

  it("returns the oldest timestamp still inside the rolling window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);
    const redisKey = `${RATE_LIMITER_PREFIX}:${key}`;
    const nowMs = Date.now();
    const oldestTimestampMs = nowMs - 30_000;

    await runOnRedis({ origin: "rate_limiter" }, async (redis) => {
      await redis.zAdd(redisKey, {
        score: oldestTimestampMs,
        value: `2000000:${crypto.randomUUID()}`,
      });
      await redis.zAdd(redisKey, {
        score: nowMs - 10_000,
        value: `3000000:${crypto.randomUUID()}`,
      });
    });

    const usage = await getWeightedRateLimiterUsage({
      key,
      timeframeSeconds: 60,
    });
    expect(usage.isOk()).toBe(true);
    if (usage.isOk()) {
      expect(usage.value).toEqual({
        count: 5_000_000,
        oldestTimestampMs,
      });
    }
  });
});

describe("fixed-window counters", () => {
  const redisKeysToDelete = new Set<string>();
  const boundsFor = (label: string) => ({
    label,
    windowEndMs: Date.UTC(2999, 0, 1),
  });

  beforeAll(async () => {
    const redisModule = await import("@app/lib/api/redis");
    const rateLimiterModule = await import("@app/lib/utils/rate_limiter");

    closeRedisClients = redisModule.closeRedisClients;
    runOnRedis = redisModule.runOnRedis;
    addFixedWindowCount = rateLimiterModule.addFixedWindowCount;
    getFixedWindowCount = rateLimiterModule.getFixedWindowCount;
  });

  afterEach(async () => {
    if (redisKeysToDelete.size > 0) {
      await runOnRedis({ origin: "rate_limiter" }, (redis) =>
        redis.del([...redisKeysToDelete])
      );
    }
    redisKeysToDelete.clear();
  });

  afterAll(async () => {
    await closeRedisClients();
  });

  it("accumulates increments within the same window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const bounds = boundsFor("w1");
    redisKeysToDelete.add(`rate_limiter:${key}:${bounds.label}`);

    await addFixedWindowCount({
      key,
      bounds,
      incrementBy: 9,
      logger,
    });
    await addFixedWindowCount({
      key,
      bounds,
      incrementBy: 2,
      logger,
    });

    const count = await getFixedWindowCount({ key, bounds });
    expect(count.isOk() && count.value).toBe(11);
  });

  it("returns 0 for a window with no entries", async () => {
    const count = await getFixedWindowCount({
      key: `test:${crypto.randomUUID()}`,
      bounds: boundsFor("w1"),
    });

    expect(count.isOk() && count.value).toBe(0);
  });

  it("keeps separate counts per window label", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const windowA = boundsFor("wA");
    const windowB = boundsFor("wB");
    redisKeysToDelete.add(`rate_limiter:${key}:${windowA.label}`);
    redisKeysToDelete.add(`rate_limiter:${key}:${windowB.label}`);

    await addFixedWindowCount({
      key,
      bounds: windowA,
      incrementBy: 4,
      logger,
    });
    await addFixedWindowCount({
      key,
      bounds: windowB,
      incrementBy: 7,
      logger,
    });

    const countA = await getFixedWindowCount({ key, bounds: windowA });
    const countB = await getFixedWindowCount({ key, bounds: windowB });
    expect(countA.isOk() && countA.value).toBe(4);
    expect(countB.isOk() && countB.value).toBe(7);
  });

  it("stores fractional credits at the microcredit scale", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const bounds = boundsFor("microcredits");
    redisKeysToDelete.add(`rate_limiter:${key}:${bounds.label}`);

    await addFixedWindowCount({
      key,
      bounds,
      incrementBy: roundCreditsToMicroCredits(2.5),
      logger,
    });
    await addFixedWindowCount({
      key,
      bounds,
      incrementBy: roundCreditsToMicroCredits(2.5),
      logger,
    });

    const count = await getFixedWindowCount({ key, bounds });
    expect(count.isOk() && count.value).toBe(5_000_000);
    expect(count.isOk() && microCreditsToCredits(count.value)).toBe(5);
  });
});
