import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatDate } from "@app/lib/i18n/format";

const FRIENDLY_DATE_OPTIONS: Record<
  "long" | "short" | "compact" | "compactWithDay",
  Intl.DateTimeFormatOptions
> = {
  long: {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  },
  short: { year: "numeric", month: "long", day: "numeric" },
  compact: { year: "numeric", month: "short" },
  compactWithDay: { year: "numeric", month: "short", day: "numeric" },
};

/**
 * Formats a timestamp to a human-readable date string.
 * @param timestamp
 * @param version - "long" (default), "short", "compact" or "compactWithDay"
 *
 * long: September 23, 2025 at 3:37:32 PM
 * short: September 23, 2025
 * compactWithDay: Sep 23, 2025
 * compact: Sep 2025
 *
 */
/**
 * @cc [owner:sfriquet,label:product] friendly-date-in-ui-locale
 * The result MUST be formatted in the UI locale (`getActiveLocale`), passed explicitly to the
 * formatter, and MUST NOT fall back to the default locale of `lib/i18n/format.ts`: its month names
 * are text, so a French browser MUST get "September 23, 2025" while the `localisation` flag is off.
 */
export function formatTimestampToFriendlyDate(
  timestamp: number,
  version: "long" | "short" | "compact" | "compactWithDay" = "long"
): string {
  return formatDate(
    timestamp,
    FRIENDLY_DATE_OPTIONS[version],
    getActiveLocale()
  );
}
