import { fromZonedTime, toZonedTime } from "date-fns-tz";
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

/**
 * @cc [owner:avervaet,label:product] fixed-utc-offset-not-dst-tracking
 * The returned UTC hour/minute is resolved once, against `reference`'s UTC offset for
 * `timezone`. A caller that bakes the result into a long-lived fixed schedule (e.g. a daily
 * cron expression) does NOT get its fire time re-resolved across DST transitions: the local
 * fire time will drift by the DST delta (typically 1h) until the schedule is recomputed.
 */
export function localTimeOfDayToUtc(
  hour: number,
  minute: number,
  timezone: string,
  reference: Date = new Date()
): { hour: number; minute: number } {
  const zonedReference = toZonedTime(reference, timezone);
  const localAt = new Date(
    zonedReference.getFullYear(),
    zonedReference.getMonth(),
    zonedReference.getDate(),
    hour,
    minute
  );
  const utcInstant = fromZonedTime(localAt, timezone);
  return { hour: utcInstant.getUTCHours(), minute: utcInstant.getUTCMinutes() };
}

export const timezoneSchema = z
  .string()
  .optional()
  .default("UTC")
  .refine((timezone) => isValidTimezone(timezone), {
    message: "Invalid IANA timezone",
  });
