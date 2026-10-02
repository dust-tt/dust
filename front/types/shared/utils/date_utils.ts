import { tzOffset } from "@date-fns/tz";
import { formatInTimeZone } from "date-fns-tz";

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const ONE_MINUTE_MS = 60 * 1000;

export function ordinalDay(day: number): string {
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";

  return `${day}${suffix}`;
}

export function formatUTCDateFromMillis(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @cc [owner:sfriquet,label:product] machine-readable-day
 * The result MUST be the `yyyy-MM-dd` calendar day of `ms` in `timezone`, with ASCII digits,
 * whatever the format locale set with `setFormatLocale`: callers use it as a bucket key and in
 * exports.
 */
export function formatDateFromMillis(ms: number, timezone: string): string {
  return formatInTimeZone(ms, timezone, "yyyy-MM-dd");
}

/**
 * @cc [owner:aubin-tchoi,label:product] resolve-local-calendar-fields
 * Given a valid Date whose UTC fields represent local calendar fields in a valid
 * `timezone`, return the matching instant independently of the host timezone.
 * Overlaps MUST select the earliest matching instant; gaps MUST move forward by
 * the offset change. The input Date MUST NOT be mutated.
 */
export function resolveCalendarDate(date: Date, timezone: string): Date {
  const calendarTimeMs = date.getTime();
  // Sample both sides of a transition. A larger offset gives the earlier instant.
  const offsetsMinutes = [-ONE_DAY_MS, ONE_DAY_MS].map((deltaMs) =>
    tzOffset(timezone, new Date(calendarTimeMs + deltaMs))
  );
  const earlier = new Date(
    calendarTimeMs - Math.max(...offsetsMinutes) * ONE_MINUTE_MS
  );
  if (
    earlier.getTime() + tzOffset(timezone, earlier) * ONE_MINUTE_MS ===
    calendarTimeMs
  ) {
    return earlier;
  }
  // The smaller offset resolves a gap forward, or a time after the rollback.
  return new Date(calendarTimeMs - Math.min(...offsetsMinutes) * ONE_MINUTE_MS);
}
