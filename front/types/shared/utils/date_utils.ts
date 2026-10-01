import { formatDateTime } from "@app/lib/i18n/format";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * @cc [owner:sfriquet,label:product] human-readable-in-format-locale
 * The result MUST be the medium date and short time of `date` in the format locale
 * (`format-locale-resolution`). Text sent to models or other machine-facing output MUST NOT use it.
 */
export function dateToHumanReadable(date: Date) {
  return formatDateTime(date, { dateStyle: "medium", timeStyle: "short" });
}

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

export function getTime(date: number): string {
  return format(new Date(date), "HH:mm");
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
