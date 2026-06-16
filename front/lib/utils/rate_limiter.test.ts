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
  getStatsDClient: () => ({
    decrement: vi.fn(),
    distribution: vi.fn(),
    increment: vi.fn(),
  }),
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

let closeRedisClients: RedisModule["closeRedisClients"];
let runOnRedis: RedisModule["runOnRedis"];
let expireRateLimiterKey: RateLimiterModule["expireRateLimiterKey"];
let getRateLimiterCount: RateLimiterModule["getRateLimiterCount"];
let rateLimiter: RateLimiterModule["rateLimiter"];
let RATE_LIMITER_PREFIX: RateLimiterModule["RATE_LIMITER_PREFIX"];

async function expireTestKey(key: string) {
  keysToExpire.add(key);
  await expireRateLimiterKey({ key });
}

describe("rateLimiter", () => {
  beforeAll(async () => {
    const redisModule = await import("@app/lib/api/redis");
    const rateLimiterModule = await import("@app/lib/utils/rate_limiter");

    closeRedisClients = redisModule.closeRedisClients;
    runOnRedis = redisModule.runOnRedis;
    expireRateLimiterKey = rateLimiterModule.expireRateLimiterKey;
    getRateLimiterCount = rateLimiterModule.getRateLimiterCount;
    RATE_LIMITER_PREFIX = rateLimiterModule.RATE_LIMITER_PREFIX;
    rateLimiter = rateLimiterModule.rateLimiter;
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
});
