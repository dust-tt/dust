import {
  getPremiumModelMessageUsage,
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
} from "@app/lib/api/assistant/rate_limits";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRateLimiterTimestamps } = vi.hoisted(() => ({
  mockGetRateLimiterTimestamps: vi.fn(),
}));

vi.mock("@app/lib/utils/rate_limiter", () => ({
  expireRateLimiterKey: vi.fn(),
  getRateLimiterCount: vi.fn(),
  getRateLimiterTimestamps: mockGetRateLimiterTimestamps,
  getTimeframeSecondsFromLiteral: vi.fn(),
}));

describe("getPremiumModelMessageUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns aggregate and daily usage for the rolling week", async () => {
    mockGetRateLimiterTimestamps.mockResolvedValue(
      new Ok([
        Date.parse("2026-08-19T11:00:00.000Z"),
        Date.parse("2026-08-20T15:00:00.000Z"),
        Date.parse("2026-08-20T16:00:00.000Z"),
        Date.parse("2026-08-26T09:00:00.000Z"),
      ])
    );

    const usage = await getPremiumModelMessageUsage({
      workspace: { id: 42 },
      user: { id: 7 },
    });

    expect(mockGetRateLimiterTimestamps).toHaveBeenCalledWith({
      key: "workspace:42:user:7:premium_model_message_count",
      timeframeSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
    });
    expect(usage).toEqual({
      usedMessages: 4,
      remainingMessages: 21,
      limitMessages: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
      windowDays: 7,
      nextRefill: null,
      dailyUsage: [
        { date: "2026-08-19", usedMessages: 1 },
        { date: "2026-08-20", usedMessages: 2 },
        { date: "2026-08-21", usedMessages: 0 },
        { date: "2026-08-22", usedMessages: 0 },
        { date: "2026-08-23", usedMessages: 0 },
        { date: "2026-08-24", usedMessages: 0 },
        { date: "2026-08-25", usedMessages: 0 },
        { date: "2026-08-26", usedMessages: 1 },
      ],
      refillSchedule: [
        { date: "2026-08-26", messages: 1 },
        { date: "2026-08-27", messages: 2 },
        { date: "2026-09-02", messages: 1 },
      ],
    });
  });

  it("returns the first refill when the limit is reached", async () => {
    const oldestTimestampMs = Date.parse("2026-08-19T11:00:00.000Z");
    mockGetRateLimiterTimestamps.mockResolvedValue(
      new Ok([
        oldestTimestampMs,
        oldestTimestampMs,
        ...Array.from({ length: 23 }, (_, index) =>
          Date.parse(`2026-08-25T${String(index).padStart(2, "0")}:00:00.000Z`)
        ),
      ])
    );

    const usage = await getPremiumModelMessageUsage({
      workspace: { id: 42 },
      user: { id: 7 },
    });

    expect(usage.nextRefill).toEqual({
      availableAt: "2026-08-26T11:00:00.000Z",
      messages: 2,
    });
  });

  it("falls back to empty usage when Redis cannot be read", async () => {
    mockGetRateLimiterTimestamps.mockResolvedValue(
      new Err(new Error("Redis unavailable"))
    );

    await expect(
      getPremiumModelMessageUsage({
        workspace: { id: 42 },
        user: { id: 7 },
      })
    ).resolves.toEqual({
      usedMessages: 0,
      remainingMessages: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
      limitMessages: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
      windowDays: 7,
      nextRefill: null,
      dailyUsage: [
        { date: "2026-08-19", usedMessages: 0 },
        { date: "2026-08-20", usedMessages: 0 },
        { date: "2026-08-21", usedMessages: 0 },
        { date: "2026-08-22", usedMessages: 0 },
        { date: "2026-08-23", usedMessages: 0 },
        { date: "2026-08-24", usedMessages: 0 },
        { date: "2026-08-25", usedMessages: 0 },
        { date: "2026-08-26", usedMessages: 0 },
      ],
      refillSchedule: [],
    });
  });
});
