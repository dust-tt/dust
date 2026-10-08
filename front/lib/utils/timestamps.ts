import {
  formatList,
  formatDate as formatLocaleDate,
  formatNumber,
  formatTime,
} from "@app/lib/i18n/format";
import {
  format,
  isValid,
  startOfDay,
  subDays,
  subMonths,
  subWeeks,
  subYears,
  toDate,
} from "date-fns";

// What moment renders for an invalid date; kept so migrated call sites never throw mid-render.
export const INVALID_DATE_LABEL = "Invalid date";

/**
 * Formats a date with a date-fns pattern, rendering invalid input as a sentinel string
 * instead of throwing.
 */
export const formatDate = (
  date: Date | number | string,
  pattern: string
): string => {
  const dateObj = toDate(date);
  return isValid(dateObj) ? format(dateObj, pattern) : INVALID_DATE_LABEL;
};

/**
 * Returns a Date that is `days` days before the given reference date (defaults to now).
 */
export function daysAgo(days: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() - days);
  return result;
}

export const cleanTimestamp = (
  timestamp: number | string | null | undefined
) => {
  if (timestamp !== null && timestamp !== undefined) {
    const timestampNumber = Number(timestamp);
    // Reject NaN, Infinity and negative timestamps: CoreAPI expects a
    // non-negative u64 (epoch ms). A pre-1970 timestamp (e.g. a Google Drive
    // file with a 1601 "zero" modifiedTime) would otherwise be rejected by
    // core with a 422 and retried forever.
    if (!Number.isFinite(timestampNumber) || timestampNumber < 0) {
      return null;
    }

    // Timestamps below 1e10 are expressed in seconds, convert to ms.
    if (timestampNumber < 1e10) {
      return Math.floor(timestampNumber * 1000);
    }

    return Math.floor(timestampNumber);
  }

  return null;
};

export const formatTimestring = (timestamp: number): string => {
  const date = new Date(timestamp);
  return formatTime(date, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param durationMs - The duration in milliseconds
 * @returns A formatted string like "9 min 12 sec" or "45 sec"
 */
export const formatDurationString = (durationMs: number): string => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formatUnit = (value: number, unit: "minute" | "second") =>
    formatNumber(value, { style: "unit", unit, unitDisplay: "short" });

  if (minutes > 0) {
    if (seconds === 0) {
      return formatUnit(minutes, "minute");
    }
    return formatList(
      [formatUnit(minutes, "minute"), formatUnit(seconds, "second")],
      { type: "unit", style: "narrow" }
    );
  }
  if (totalSeconds === 0) {
    return `< ${formatUnit(1, "second")}`;
  }
  return formatUnit(seconds, "second");
};

/**
 * @cc [owner:avervaet,label:coding] precise-unlocalized-duration
 * Renders `340ms` under one second, `1.2s` otherwise. MUST NOT be localized or rounded into
 * larger units.
 */
export const formatDurationMs = (durationMs: number): string =>
  durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;

/**
 * Formats a timestamp to a short date string (e.g., "Jan 15").
 * @param timestamp - The timestamp to format (number or string in milliseconds)
 * @returns A formatted string like "Jan 15"
 */
export const formatShortDate = (timestamp: number | string): string => {
  return formatLocaleDate(new Date(timestamp), {
    month: "short",
    day: "numeric",
  });
};

export type RelativeDateBucket =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

/**
 * Builds a bucketing function with the thresholds computed once, for callers that
 * classify many dates against the same reference point.
 */
export const makeRelativeDateBucketer = (
  now: Date = new Date()
): ((date: Date | number) => RelativeDateBucket) => {
  const thresholds: [number, RelativeDateBucket][] = [
    [startOfDay(now).getTime(), "Today"],
    [startOfDay(subDays(now, 1)).getTime(), "Yesterday"],
    [startOfDay(subWeeks(now, 1)).getTime(), "Last Week"],
    [startOfDay(subMonths(now, 1)).getTime(), "Last Month"],
    [startOfDay(subYears(now, 1)).getTime(), "Last 12 Months"],
  ];

  return (date) => {
    const dateObj = toDate(date);
    if (!isValid(dateObj)) {
      // An invalid date silently sorts as "Older" rather than throwing mid-render,
      // for consistency with the other formatters in this module.
      return "Older";
    }

    const timeMs = dateObj.getTime();
    for (const [thresholdMs, bucket] of thresholds) {
      if (timeMs >= thresholdMs) {
        return bucket;
      }
    }
    return "Older";
  };
};

export const getRelativeDateBucket = (
  date: Date | number,
  now: Date = new Date()
): RelativeDateBucket => makeRelativeDateBucketer(now)(date);
