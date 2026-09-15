import logger from "@app/logger/logger";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";

// Intl throws on a timezone it doesn't recognize, and date-fns-tz relies on Intl
// for zone resolution, so a value that passes here is safe to hand to it.
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const MINUTES_IN_A_DAY = 1440;

// date-fns-tz's getTimezoneOffset resolves ambiguity by treating `date` as a local wall-clock
// reading rather than a UTC instant, which is off by the DST delta for an instant that falls
// in the hour surrounding a transition. Intl's "longOffset" is instant-aware, so it doesn't
// have that failure mode.
function getUtcOffsetMinutes(timezone: string, instant: Date): number {
  if (!isValidTimezone(timezone)) {
    logger.warn(
      { timezone },
      "Invalid IANA timezone, resolving time-of-day as UTC"
    );
    return 0;
  }
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = offsetName && /^GMT([+-])(\d{2}):(\d{2})$/.exec(offsetName);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * @cc [owner:avervaet,label:backend] fixed-utc-offset-not-dst-tracking
 * The returned UTC hour/minute is resolved once, against `reference`'s UTC offset for
 * `timezone`. A caller that bakes the result into a long-lived fixed schedule (e.g. a daily
 * cron expression) does NOT get its fire time re-resolved across DST transitions: the local
 * fire time will drift by the DST delta (typically 1h) until the schedule is recomputed.
 *
 * @cc [owner:avervaet,label:backend;error-handling] unknown-timezone-resolves-as-utc
 * An unrecognized `timezone` never throws: the wall time is returned unchanged (offset 0) and a
 * warning is logged, matching the moment.js fallback this replaces. Callers that need a hard
 * failure must validate upstream with `isValidTimezone`.
 */
export function localTimeOfDayToUtc(
  hour: number,
  minute: number,
  timezone: string,
  reference: Date = new Date()
): { hour: number; minute: number } {
  const offsetMinutes = getUtcOffsetMinutes(timezone, reference);
  const relativeMinutesOfDay = hour * 60 + minute - offsetMinutes;
  const minutesOfDay =
    ((relativeMinutesOfDay % MINUTES_IN_A_DAY) + MINUTES_IN_A_DAY) %
    MINUTES_IN_A_DAY;
  return { hour: Math.floor(minutesOfDay / 60), minute: minutesOfDay % 60 };
}

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @cc [owner:avervaet,label:product] calendar-date-must-exist
 * A `yyyy-MM-dd` string that matches the shape but names a day that does not exist
 * (e.g. `2024-02-30`) is rejected as `null`; it never rolls over into the next month.
 */
export function parseCalendarDate(
  isoDate: string
): { year: number; month: number; day: number } | null {
  if (!CALENDAR_DATE_RE.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const exists =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return exists ? { year, month, day } : null;
}

/**
 * @cc [owner:avervaet,label:product] bare-date-is-already-local
 * `isoDate` is a bare `yyyy-MM-dd` calendar day read as a wall-clock day in `timezone`. It is
 * NOT parsed as a UTC instant and then re-observed in `timezone`, which for most timezones would
 * resolve to the wrong calendar day.
 */
/**
 * @cc [owner:avervaet,label:product] calendar-day-offset-is-dst-safe
 * `offsetDays` shifts by whole calendar days, not by a fixed `86400000 * offsetDays`
 * milliseconds. A 23h or 25h local day (a DST transition day) still counts as exactly one day.
 */
/**
 * @cc [owner:avervaet,label:backend] day-boundary-is-host-tz-independent
 * The wall clock is built from UTC components and handed to date-fns-tz as an offset-less
 * string, so the result never depends on the process timezone, even on a host whose own DST
 * transition falls at local midnight.
 */
/**
 * @cc [owner:avervaet,label:error-handling] day-boundary-degrades-to-invalid-date
 * An unparseable `isoDate`, a non-existent calendar day, or an unknown `timezone` yields an
 * `Invalid Date` rather than throwing; callers that serialize the result are responsible for
 * handling it.
 */
export function dayBoundaryInTimezone(
  isoDate: string,
  timezone: string,
  {
    offsetDays = 0,
    boundary = "start",
  }: { offsetDays?: number; boundary?: "start" | "end" } = {}
): Date {
  const parsed = parseCalendarDate(isoDate);
  if (!parsed) {
    return new Date(NaN);
  }
  const wallClockMs =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + offsetDays) +
    (boundary === "end" ? ONE_DAY_MS - 1 : 0);
  // Dropping the trailing "Z" makes date-fns-tz read the string as local to `timezone`.
  return fromZonedTime(
    new Date(wallClockMs).toISOString().slice(0, -1),
    timezone
  );
}

export const timezoneSchema = z
  .string()
  .optional()
  .default("UTC")
  .refine((timezone) => isValidTimezone(timezone), {
    message: "Invalid IANA timezone",
  });
