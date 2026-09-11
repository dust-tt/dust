import {
  addMonths,
  differenceInCalendarDays,
  format,
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

// moment's month/day conversion constant (average Gregorian month length in days).
const DAYS_PER_MONTH = 146097 / 4800;

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

/**
 * Splits the span between two instants into whole calendar months plus a millisecond
 * remainder, the way moment builds a duration from two moments. Month steps clamp to the end
 * of shorter months, so Jan 31 -> Feb 28 counts as one full month.
 */
function splitIntoMonthsAndMs(
  from: Date,
  to: Date
): { months: number; remainderMs: number } {
  let months =
    to.getMonth() -
    from.getMonth() +
    (to.getFullYear() - from.getFullYear()) * 12;
  if (addMonths(from, months).getTime() > to.getTime()) {
    months -= 1;
  }
  return {
    months,
    remainderMs: to.getTime() - addMonths(from, months).getTime(),
  };
}

/**
 * Port of moment's default English `relativeTime` thresholds and rounding, so the wording
 * ("a few seconds", "an hour", "3 days", ...) is identical to what `.fromNow()` produced.
 */
function humanizeDuration(months: number, remainderMs: number): string {
  const wholeDays = Math.round(months * DAYS_PER_MONTH);
  const seconds = Math.round(wholeDays * 86400 + remainderMs / 1000);
  const minutes = Math.round(wholeDays * 1440 + remainderMs / 60_000);
  const hours = Math.round(wholeDays * 24 + remainderMs / 3_600_000);
  const days = Math.round(wholeDays + remainderMs / 86_400_000);
  const fractionalMonths = months + remainderMs / 86_400_000 / DAYS_PER_MONTH;
  const roundedMonths = Math.round(fractionalMonths);
  const years = Math.round(fractionalMonths / 12);

  if (seconds <= 44) {
    return "a few seconds";
  }
  if (minutes <= 1) {
    return "a minute";
  }
  if (minutes < 45) {
    return `${minutes} minutes`;
  }
  if (hours <= 1) {
    return "an hour";
  }
  if (hours < 22) {
    return `${hours} hours`;
  }
  if (days <= 1) {
    return "a day";
  }
  if (days < 26) {
    return `${days} days`;
  }
  if (roundedMonths <= 1) {
    return "a month";
  }
  if (roundedMonths < 11) {
    return `${roundedMonths} months`;
  }
  if (years <= 1) {
    return "a year";
  }
  return `${years} years`;
}

/**
 * @cc [owner:avervaet,label:coding] moment-fromnow-replacement
 * This is the standard replacement for moment's `.fromNow()`: new code needing a relative
 * "n units ago" timestamp must use this helper instead of importing `moment`. It reproduces
 * moment's default English wording and thresholds exactly, and renders invalid dates as
 * "Invalid date" rather than throwing.
 */
/**
 * Formats a date as a relative time string.
 * @param date - The date to format (Date object or timestamp in milliseconds)
 * @param now - The reference instant (defaults to now)
 * @returns A formatted string like "3 hours ago", "a few seconds ago" or "in 2 days"
 */
export const formatRelativeTime = (
  date: Date | number,
  now: Date = new Date()
): string => {
  const dateObj = toDate(date);
  if (!isValid(dateObj)) {
    return INVALID_DATE_LABEL;
  }

  const isFuture = dateObj.getTime() > now.getTime();
  const [from, to] = isFuture ? [now, dateObj] : [dateObj, now];
  const { months, remainderMs } = splitIntoMonthsAndMs(from, to);
  const humanized = humanizeDuration(months, remainderMs);

  return isFuture ? `in ${humanized}` : `${humanized} ago`;
};

/**
 * @cc [owner:avervaet,label:coding] moment-calendar-replacement
 * This is the standard replacement for moment's `.calendar()` sameDay/lastDay/lastWeek
 * pattern: new code needing that calendar-style timestamp display must use this helper
 * instead of importing `moment`. It keeps moment's default nextDay/nextWeek/sameElse outputs
 * for future dates and renders invalid dates as "Invalid date" rather than throwing.
 */
/**
 * Formats a date in a calendar-relative way, including the time of day.
 * @param date - The date to format (Date object or timestamp in milliseconds)
 * @param now - The reference instant (defaults to now)
 * @returns A formatted string like "Today at 3:45:00 PM", "Yesterday at 3:45:00 PM",
 * "Last Monday at 3:45:00 PM", "Tomorrow at 3:45 PM", "Friday at 3:45 PM" or "09/10/2026"
 */
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
