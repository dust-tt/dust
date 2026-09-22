import {
  getPremiumModelMessageUsage,
  makeFairUseFixedWindowBounds,
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

describe("makeFairUseFixedWindowBounds", () => {
  // 2026-08-26 is a Wednesday; the Monday of its week is 2026-08-24 00:00 UTC
  // and the week ends at the next Monday, 2026-08-31 00:00 UTC.
  const MONDAY_MS = Date.parse("2026-08-24T00:00:00.000Z");
  const NEXT_MONDAY_MS = Date.parse("2026-08-31T00:00:00.000Z");

  describe("week", () => {
    it("anchors mid-week to the current Monday", () => {
      expect(
        makeFairUseFixedWindowBounds(
          "week",
          new Date("2026-08-26T10:30:00.000Z")
        )
      ).toEqual({ label: `week-${MONDAY_MS}`, windowEndMs: NEXT_MONDAY_MS });
    });

    it("treats Monday 00:00 as the start of its own window", () => {
      expect(
        makeFairUseFixedWindowBounds(
          "week",
          new Date("2026-08-24T00:00:00.000Z")
        )
      ).toEqual({ label: `week-${MONDAY_MS}`, windowEndMs: NEXT_MONDAY_MS });
    });

    it("keeps Sunday in the week that opened the previous Monday", () => {
      expect(
        makeFairUseFixedWindowBounds(
          "week",
          new Date("2026-08-30T23:59:59.000Z")
        )
      ).toEqual({ label: `week-${MONDAY_MS}`, windowEndMs: NEXT_MONDAY_MS });
    });

    it("rolls to the next window once the next Monday begins", () => {
      expect(
        makeFairUseFixedWindowBounds(
          "week",
          new Date("2026-08-31T00:00:00.000Z")
        )
      ).toEqual({
        label: `week-${NEXT_MONDAY_MS}`,
        windowEndMs: Date.parse("2026-09-07T00:00:00.000Z"),
      });
    });
  });

  describe("day", () => {
    it("spans the current UTC calendar day", () => {
      const dayStart = Date.parse("2026-08-26T00:00:00.000Z");
      expect(
        makeFairUseFixedWindowBounds(
          "day",
          new Date("2026-08-26T10:30:00.000Z")
        )
      ).toEqual({
        label: `day-${dayStart}`,
        windowEndMs: Date.parse("2026-08-27T00:00:00.000Z"),
      });
    });

    it("rolls the month boundary to the first of the next month", () => {
      const dayStart = Date.parse("2026-08-31T00:00:00.000Z");
      expect(
        makeFairUseFixedWindowBounds(
          "day",
          new Date("2026-08-31T23:59:59.000Z")
        )
      ).toEqual({
        label: `day-${dayStart}`,
        windowEndMs: Date.parse("2026-09-01T00:00:00.000Z"),
      });
    });
  });

  describe("month", () => {
    it("spans the current UTC calendar month, rolling year at December", () => {
      const monthStart = Date.parse("2026-12-01T00:00:00.000Z");
      expect(
        makeFairUseFixedWindowBounds(
          "month",
          new Date("2026-12-15T10:30:00.000Z")
        )
      ).toEqual({
        label: `month-${monthStart}`,
        windowEndMs: Date.parse("2027-01-01T00:00:00.000Z"),
      });
    });
  });

  describe("lifetime", () => {
    it("never rolls: a single stable bucket", () => {
      expect(
        makeFairUseFixedWindowBounds(
          "lifetime",
          new Date("2026-08-26T10:30:00.000Z")
        )
      ).toEqual({
        label: "lifetime",
        windowEndMs: Date.parse("2100-01-01T00:00:00.000Z"),
      });
    });
  });
});
