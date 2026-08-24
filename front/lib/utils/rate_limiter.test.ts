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
let addRateLimiterCount: RateLimiterModule["addRateLimiterCount"];
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
    addRateLimiterCount = rateLimiterModule.addRateLimiterCount;
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

describe("addRateLimiterCount", () => {
  beforeAll(async () => {
    const redisModule = await import("@app/lib/api/redis");
    const rateLimiterModule = await import("@app/lib/utils/rate_limiter");

    closeRedisClients = redisModule.closeRedisClients;
    addRateLimiterCount = rateLimiterModule.addRateLimiterCount;
    expireRateLimiterKey = rateLimiterModule.expireRateLimiterKey;
    getRateLimiterCount = rateLimiterModule.getRateLimiterCount;
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

  it("records the full amount even when it overshoots what a limit-guarded write would allow", async () => {
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
      incrementBy: 2,
      logger,
    });

    const count = await getRateLimiterCount({
      key,
      timeframeSeconds: 60,
    });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(11);
    }
  });

  it("is counted correctly by getRateLimiterCount alongside plain rateLimiter writes", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await expireTestKey(key);

    await addRateLimiterCount({
      key,
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
});

describe("fixed-window counter", () => {
  let addFixedWindowCount: RateLimiterModule["addFixedWindowCount"];
  let getFixedWindowCount: RateLimiterModule["getFixedWindowCount"];

  const fixedWindowKeysToExpire = new Set<string>();

  // A far-future window boundary so entries persist for the whole test run.
  const boundsFor = (label: string) => ({
    label,
    windowEndMs: Date.UTC(2999, 0, 1),
  });

  beforeAll(async () => {
    const redisModule = await import("@app/lib/api/redis");
    const rateLimiterModule = await import("@app/lib/utils/rate_limiter");

    closeRedisClients = redisModule.closeRedisClients;
    expireRateLimiterKey = rateLimiterModule.expireRateLimiterKey;
    addFixedWindowCount = rateLimiterModule.addFixedWindowCount;
    getFixedWindowCount = rateLimiterModule.getFixedWindowCount;
  });

  afterEach(async () => {
    // Fixed-window keys are suffixed with the window label, so expire the
    // fully-qualified key rather than the base.
    await Promise.all(
      [...fixedWindowKeysToExpire].map((key) => expireRateLimiterKey({ key }))
    );
    fixedWindowKeysToExpire.clear();
  });

  afterAll(async () => {
    await closeRedisClients();
  });

  it("accumulates increments within the same window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const bounds = boundsFor("w1");
    fixedWindowKeysToExpire.add(`${key}:${bounds.label}`);

    await addFixedWindowCount({ key, bounds, incrementBy: 9, logger });
    await addFixedWindowCount({ key, bounds, incrementBy: 2, logger });

    const count = await getFixedWindowCount({ key, bounds });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      // Unlike the limit-guarded rolling limiter, the fixed-window counter
      // records the full amount even past any threshold.
      expect(count.value).toBe(11);
    }
  });

  it("returns 0 for a window with no entries", async () => {
    const key = `test:${crypto.randomUUID()}`;

    const count = await getFixedWindowCount({ key, bounds: boundsFor("w1") });
    expect(count.isOk()).toBe(true);
    if (count.isOk()) {
      expect(count.value).toBe(0);
    }
  });

  it("keeps separate counts per window label", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const windowA = boundsFor("wA");
    const windowB = boundsFor("wB");
    fixedWindowKeysToExpire.add(`${key}:${windowA.label}`);
    fixedWindowKeysToExpire.add(`${key}:${windowB.label}`);

    await addFixedWindowCount({ key, bounds: windowA, incrementBy: 4, logger });
    await addFixedWindowCount({ key, bounds: windowB, incrementBy: 7, logger });

    const countA = await getFixedWindowCount({ key, bounds: windowA });
    const countB = await getFixedWindowCount({ key, bounds: windowB });
    expect(countA.isOk() && countA.value).toBe(4);
    expect(countB.isOk() && countB.value).toBe(7);
  });

  // Mirrors the spend-cap recorder/enforcer: the counter stores microCredits
  // (credits × 1e6) so it survives a switch to fractional credits. Recording a
  // fractional 2.5-credit delta must land as 2_500_000 microCredits, and
  // enforcement blocks once the counter reaches the cap scaled up the same way
  // (cap × 1e6).
  it("stores fractional credits as integer microCredits and enforces caps at the microCredit scale", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const bounds = boundsFor("microcredits");
    fixedWindowKeysToExpire.add(`${key}:${bounds.label}`);

    const capCredits = 5;

    // First fractional delta: 2.5 credits recorded as microCredits.
    await addFixedWindowCount({
      key,
      bounds,
      incrementBy: roundCreditsToMicroCredits(2.5),
      logger,
    });

    const afterFirst = await getFixedWindowCount({ key, bounds });
    expect(afterFirst.isOk() && afterFirst.value).toBe(2_500_000);
    // 2.5 < 5 credits: enforcement does not block yet.
    expect(
      afterFirst.isOk() &&
        afterFirst.value >= roundCreditsToMicroCredits(capCredits)
    ).toBe(false);

    // Second fractional delta brings the total to exactly the cap.
    await addFixedWindowCount({
      key,
      bounds,
      incrementBy: roundCreditsToMicroCredits(2.5),
      logger,
    });

    const afterSecond = await getFixedWindowCount({ key, bounds });
    expect(afterSecond.isOk() && afterSecond.value).toBe(5_000_000);
    // Reached cap × 1e6: enforcement blocks.
    expect(
      afterSecond.isOk() &&
        afterSecond.value >= roundCreditsToMicroCredits(capCredits)
    ).toBe(true);
    // The poke read converts the counter back to whole credits.
    expect(afterSecond.isOk() && microCreditsToCredits(afterSecond.value)).toBe(
      5
    );
  });
});
