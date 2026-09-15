import logger from "@app/logger/logger";
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

export const timezoneSchema = z
  .string()
  .optional()
  .default("UTC")
  .refine((timezone) => isValidTimezone(timezone), {
    message: "Invalid IANA timezone",
  });
