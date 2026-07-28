// Timeframe groupings for the Redis rate limiter's window mechanics.

// Rolling windows: the counter looks back over the trailing period from "now"
// (`lifetime` is mapped to a 30-day rolling window).
export const ROLLING_AWU_CREDITS_TIMEFRAMES = [
  "day",
  "week",
  "month",
  "lifetime",
] as const;
export type RollingAwuCreditsTimeframeType =
  (typeof ROLLING_AWU_CREDITS_TIMEFRAMES)[number];

export function isRollingAwuCreditsTimeframeType(
  value: string
): value is RollingAwuCreditsTimeframeType {
  return (ROLLING_AWU_CREDITS_TIMEFRAMES as unknown as string[]).includes(
    value
  );
}

// Calendar (fixed) windows: the counter resets at a UTC clock boundary (start
// of day / ISO week / month), computed with pure date math.
export const CALENDAR_AWU_CREDITS_TIMEFRAMES = [
  "calendar_day",
  "calendar_week",
  "calendar_month",
] as const;
export type CalendarAwuCreditsTimeframeType =
  (typeof CALENDAR_AWU_CREDITS_TIMEFRAMES)[number];
