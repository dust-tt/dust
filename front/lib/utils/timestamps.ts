import {
  differenceInCalendarDays,
  format,
  formatDistance,
  isToday,
  isTomorrow,
  isValid,
  isYesterday,
  startOfDay,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";

// What moment renders for an invalid date; kept so migrated call sites never throw mid-render.
const INVALID_DATE_LABEL = "Invalid date";

function isTimestamp(value: Date | number): value is number {
  return typeof value === "number";
}

function toDate(value: Date | number): Date {
  return isTimestamp(value) ? new Date(value) : value;
}

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
  return date.toLocaleTimeString(undefined, {
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

  if (minutes > 0) {
    if (seconds === 0) {
      return `${minutes} min`;
    }
    return `${minutes} min ${seconds} sec`;
  }
  if (totalSeconds === 0) {
    return "< 1 sec";
  }
  return `${seconds} sec`;
};

/**
 * Formats a timestamp to a short date string (e.g., "Jan 15").
 * @param timestamp - The timestamp to format (number or string in milliseconds)
 * @returns A formatted string like "Jan 15"
 */
export const formatShortDate = (timestamp: number | string): string => {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

/**
 * Formats a date in a calendar-relative way.
 * @param date - The date to format (Date object or timestamp)
 * @returns A formatted string like "Today", "Yesterday", "Last Monday", or "13/10/2025"
 */
export const formatCalendarDate = (date: Date | number): string => {
  const dateObj = typeof date === "number" ? new Date(date) : date;

  if (isToday(dateObj)) {
    return "Today";
  }
  if (isTomorrow(dateObj)) {
    return "Tomorrow";
  }
  if (isYesterday(dateObj)) {
    return "Yesterday";
  }

  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays > 0 && diffInDays <= 7) {
    return `Last ${format(dateObj, "EEEE")}`;
  }

  if (diffInDays < 0 && diffInDays >= -7) {
    return format(dateObj, "EEEE");
  }

  return format(dateObj, "dd/MM/yyyy");
};

export const formatRelativeTime = (
  date: Date | number,
  now: Date = new Date()
): string => {
  const dateObj = toDate(date);
  if (!isValid(dateObj)) {
    return INVALID_DATE_LABEL;
  }

  return formatDistance(dateObj, now, { addSuffix: true });
};

export const formatCalendarDateTime = (
  date: Date | number,
  now: Date = new Date()
): string => {
  const dateObj = toDate(date);
  if (!isValid(dateObj)) {
    return INVALID_DATE_LABEL;
  }

  // Calendar-day distance is DST-safe: a 23h or 25h day still counts as exactly one day.
  const diffDays = differenceInCalendarDays(dateObj, now);
  const timeWithSeconds = format(dateObj, "h:mm:ss a");

  if (diffDays === 0) {
    return `Today at ${timeWithSeconds}`;
  }
  if (diffDays === -1) {
    return `Yesterday at ${timeWithSeconds}`;
  }
  if (diffDays >= -6 && diffDays < -1) {
    return `Last ${format(dateObj, "EEEE")} at ${timeWithSeconds}`;
  }

  // moment's built-in future formats use LT (no seconds), unlike the overridden past ones.
  const timeWithoutSeconds = format(dateObj, "h:mm a");
  if (diffDays === 1) {
    return `Tomorrow at ${timeWithoutSeconds}`;
  }
  if (diffDays > 1 && diffDays < 7) {
    return `${format(dateObj, "EEEE")} at ${timeWithoutSeconds}`;
  }

  return format(dateObj, "MM/dd/yyyy");
};

export type RelativeDateBucket =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

/**
 * @cc [owner:avervaet,label:coding] moment-bucket-replacement
 * This is the standard replacement for moment-based Today/Yesterday/Last Week/... list
 * bucketing: new code needing that bucketing must use this helper instead of importing
 * `moment`. Bucket boundaries are computed by shifting `now` first and taking the start of
 * that day second; the reverse order drifts by an hour on days where midnight does not exist
 * (zones whose DST switch happens at 00:00).
 */
/**
 * Buckets a date into a coarse relative-time group, for sectioning lists (e.g. sidebar
 * conversation lists) into "Today", "Yesterday", "Last Week", etc.
 * @param date - The date to bucket (Date object or timestamp in milliseconds)
 * @param now - The reference date to bucket against (defaults to now)
 */
export const getRelativeDateBucket = (
  date: Date | number,
  now: Date = new Date()
): RelativeDateBucket => {
  const timeMs = toDate(date).getTime();

  if (timeMs >= startOfDay(now).getTime()) {
    return "Today";
  }
  if (timeMs >= startOfDay(subDays(now, 1)).getTime()) {
    return "Yesterday";
  }
  if (timeMs >= startOfDay(subWeeks(now, 1)).getTime()) {
    return "Last Week";
  }
  if (timeMs >= startOfDay(subMonths(now, 1)).getTime()) {
    return "Last Month";
  }
  if (timeMs >= startOfDay(subYears(now, 1)).getTime()) {
    return "Last 12 Months";
  }
  return "Older";
};
