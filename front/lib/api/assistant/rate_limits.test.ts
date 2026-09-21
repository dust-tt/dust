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
  // and the window ends at the next Monday, 2026-08-31 00:00 UTC.
  const MONDAY_MS = Date.parse("2026-08-24T00:00:00.000Z");
  const NEXT_MONDAY_MS = Date.parse("2026-08-31T00:00:00.000Z");

  it("anchors mid-week to the current Monday", () => {
    const bounds = makeFairUseFixedWindowBounds(
      new Date("2026-08-26T10:30:00.000Z")
    );
    expect(bounds).toEqual({
      label: `week-${MONDAY_MS}`,
      windowEndMs: NEXT_MONDAY_MS,
    });
  });

  it("treats Monday 00:00 as the start of its own window", () => {
    const bounds = makeFairUseFixedWindowBounds(
      new Date("2026-08-24T00:00:00.000Z")
    );
    expect(bounds).toEqual({
      label: `week-${MONDAY_MS}`,
      windowEndMs: NEXT_MONDAY_MS,
    });
  });

  it("keeps Sunday in the week that opened the previous Monday", () => {
    const bounds = makeFairUseFixedWindowBounds(
      new Date("2026-08-30T23:59:59.000Z")
    );
    expect(bounds).toEqual({
      label: `week-${MONDAY_MS}`,
      windowEndMs: NEXT_MONDAY_MS,
    });
  });

  it("rolls to the next window once the next Monday begins", () => {
    const bounds = makeFairUseFixedWindowBounds(
      new Date("2026-08-31T00:00:00.000Z")
    );
    expect(bounds).toEqual({
      label: `week-${NEXT_MONDAY_MS}`,
      windowEndMs: Date.parse("2026-09-07T00:00:00.000Z"),
    });
  });
});
