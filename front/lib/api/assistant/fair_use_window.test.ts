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

type RateLimitsModule = typeof import("@app/lib/api/assistant/rate_limits");
type RateLimiterModule = typeof import("@app/lib/utils/rate_limiter");
type RedisModule = typeof import("@app/lib/api/redis");

let getFairUseAwuCreditsCount: RateLimitsModule["getFairUseAwuCreditsCount"];
let recordFairUseAwuCredits: RateLimitsModule["recordFairUseAwuCredits"];
let computeCalendarWindowBounds: RateLimiterModule["computeCalendarWindowBounds"];
let expireRateLimiterKey: RateLimiterModule["expireRateLimiterKey"];
let closeRedisClients: RedisModule["closeRedisClients"];

const keysToExpire = new Set<string>();

describe("fair-use AWU window dispatch", () => {
  beforeAll(async () => {
    const rl = await import("@app/lib/api/assistant/rate_limits");
    const rlim = await import("@app/lib/utils/rate_limiter");
    const redis = await import("@app/lib/api/redis");

    getFairUseAwuCreditsCount = rl.getFairUseAwuCreditsCount;
    recordFairUseAwuCredits = rl.recordFairUseAwuCredits;
    computeCalendarWindowBounds = rlim.computeCalendarWindowBounds;
    expireRateLimiterKey = rlim.expireRateLimiterKey;
    closeRedisClients = redis.closeRedisClients;
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

  it("round-trips a rolling timeframe via the rolling limiter", async () => {
    const key = `test:${crypto.randomUUID()}`;
    keysToExpire.add(key);

    await recordFairUseAwuCredits({
      key,
      timeframe: "day",
      incrementBy: 5,
      logger,
    });

    const result = await getFairUseAwuCreditsCount({ key, timeframe: "day" });
    expect(result.isOk() && result.value).toBe(5);
  });

  it("round-trips a calendar (fixed) timeframe via the fixed-window counter", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const { label } = computeCalendarWindowBounds("calendar_week", new Date());
    keysToExpire.add(`${key}:${label}`);

    await recordFairUseAwuCredits({
      key,
      timeframe: "calendar_week",
      incrementBy: 7,
      logger,
    });

    const result = await getFairUseAwuCreditsCount({
      key,
      timeframe: "calendar_week",
    });
    expect(result.isOk() && result.value).toBe(7);
  });
});
