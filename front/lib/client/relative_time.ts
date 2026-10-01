import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatRelativeTime as formatRelativeTimeInLocale } from "@app/lib/i18n/format";
import { INVALID_DATE_LABEL } from "@app/lib/utils/timestamps";
import type { SupportedLocale } from "@app/types/locale";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * DAY_MS],
  ["month", 30 * DAY_MS],
  ["day", DAY_MS],
  ["hour", HOUR_MS],
  ["minute", MINUTE_MS],
];

/**
 * @cc [owner:sfriquet,label:product] short-form-style-per-locale
 * The short form of `timeAgoFrom` MUST use the style of its UI locale in this map, and each style
 * MUST render the direction in words ("3d ago", "il y a 3 j"), never as a sign ("-3 j").
 */
const SHORT_FORM_STYLE_BY_LOCALE: Record<
  SupportedLocale,
  Intl.RelativeTimeFormatStyle
> = {
  "en-US": "narrow",
  "en-GB": "narrow",
  "fr-FR": "short",
};

/**
 * @cc [owner:sfriquet,label:product] relative-time-in-ui-locale
 * Relative times MUST be formatted in the UI locale (`getActiveLocale`), passed explicitly to the
 * formatter, and MUST NOT fall back to the default locale of `lib/i18n/format.ts`, which is the
 * browser's when the `localisation` flag is off. With the flag off, a French browser MUST get
 * "3 days ago", not "il y a 3 jours".
 */
/**
 * @cc [owner:sfriquet,label:product] relative-time-wording
 * The elapsed time MUST be counted in the largest unit among years (365 days), months (30 days),
 * days, hours and minutes in which it is at least 1, truncated toward zero, and rendered with
 * `numeric: "always"` ("1 day ago", "in 2 hours", never "yesterday"). Under one minute in either
 * direction it MUST render zero seconds with `numeric: "auto"` ("now"), and an invalid date MUST
 * render "Invalid date" instead of throwing.
 */
function formatElapsedTime(
  date: Date | number,
  now: Date,
  form: "short" | "long"
): string {
  const elapsedMs = new Date(date).getTime() - now.getTime();
  if (Number.isNaN(elapsedMs)) {
    return INVALID_DATE_LABEL;
  }

  const locale = getActiveLocale();
  const style = form === "short" ? SHORT_FORM_STYLE_BY_LOCALE[locale] : "long";
  for (const [unit, unitMs] of RELATIVE_TIME_UNITS) {
    const value = Math.trunc(elapsedMs / unitMs);
    if (value !== 0) {
      return formatRelativeTimeInLocale(
        value,
        unit,
        { numeric: "always", style },
        locale
      );
    }
  }

  return formatRelativeTimeInLocale(
    0,
    "second",
    { numeric: "auto", style },
    locale
  );
}

export function timeAgoFrom(
  millisSinceEpoch: number,
  { useLongFormat = false }: { useLongFormat?: boolean } = {}
): string {
  return formatElapsedTime(
    millisSinceEpoch,
    new Date(),
    useLongFormat ? "long" : "short"
  );
}

export function formatRelativeTime(
  date: Date | number,
  now: Date = new Date()
): string {
  return formatElapsedTime(date, now, "long");
}
