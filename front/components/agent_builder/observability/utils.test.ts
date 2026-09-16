import { getDayTimestamps } from "@app/components/agent_builder/observability/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getDayTimestamps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns periodDays midnight timestamps ending yesterday, in UTC", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const timestamps = getDayTimestamps(3, "UTC");
    expect(timestamps).toEqual([
      new Date("2024-06-13T00:00:00Z").getTime(),
      new Date("2024-06-14T00:00:00Z").getTime(),
      new Date("2024-06-15T00:00:00Z").getTime(),
    ]);
  });

  it("resolves midnight in the given timezone, not UTC", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const timestamps = getDayTimestamps(1, "America/New_York");
    // Midnight EDT (UTC-4) on 2024-06-15.
    expect(timestamps).toEqual([new Date("2024-06-15T04:00:00Z").getTime()]);
  });

  it("still returns one timestamp per day across a DST spring-forward transition", () => {
    // 2024-03-10 is the DST transition day in America/New_York (23h day).
    vi.setSystemTime(new Date("2024-03-12T12:00:00Z"));
    const timestamps = getDayTimestamps(3, "America/New_York");
    expect(timestamps).toEqual([
      new Date("2024-03-10T05:00:00Z").getTime(), // Mar 10, still EST (UTC-5)
      new Date("2024-03-11T04:00:00Z").getTime(), // Mar 11, now EDT (UTC-4)
      new Date("2024-03-12T04:00:00Z").getTime(),
    ]);
  });
});
