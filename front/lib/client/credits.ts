import { getActiveLocale } from "@app/lib/i18n/active_locale";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
} from "@app/lib/i18n/format";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
} from "@app/types/plan";
import { TIMEFRAME_SECONDS } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

// Format a number of AWU credits for display (thousands separators, at most
// one decimal). Shared across the credits usage table and the message /
// conversation cost menu entries.
export function formatCredits(credits: number): string {
  return formatNumber(credits, { maximumFractionDigits: 1 });
}

// Format AWU credits with exactly one decimal (e.g. "310.0"), so values in
// per-message average columns stay visually consistent.
export function formatAvgCredits(credits: number): string {
  return formatNumber(credits, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// Format AWU credits with full fractional precision (up to 6 decimals,
// trailing zeros trimmed). Used by Poke debugging views that surface
// microcredit-derived figures (e.g. the rate-limiter counter), where an
// integer-rounded display would hide fractional-credit divergence.
export function formatCreditsPrecise(credits: number): string {
  return formatNumber(credits, { maximumFractionDigits: 6 });
}

export function formatCreditValue(credits: number, t: Translate): string {
  const displayedCredits = Math.round(credits * 10) / 10;
  const formattedCredits = formatCredits(credits);
  return t(
    msg`${plural(displayedCredits, {
      one: `${formattedCredits} credit`,
      other: `${formattedCredits} credits`,
    })}`
  );
}

export function toolUsageLabel(callCount: number, t: Translate): string {
  return t(msg`${plural(callCount, { one: "# use", other: "# uses" })}`);
}

export function formatCreditsCompact(credits: number): string {
  return formatNumber(credits, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatMicroUsdCompact(microUsd: number): string {
  const dollars = microUsd / 1_000_000;
  return formatCurrency(dollars, "USD", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

// Relative UTC day label for a reset/refill date: "today", "tomorrow", a
// weekday within the week ("on Monday"), or the calendar date beyond that
// ("on Oct 6"). Shared by the fair-use and premium-usage reset copy.
/**
 * @cc [owner:sfriquet,label:product] reset-day-in-ui-locale
 * The day label MUST be formatted in the UI locale (`getActiveLocale`), passed explicitly to the
 * formatters, and MUST NOT fall back to the default locale of `lib/i18n/format.ts`, which is the
 * browser's when the `localisation` flag is off: a French browser MUST then get "tomorrow", not
 * "demain". "today" and "tomorrow" MUST come from `numeric: "auto"`, and the "on …" phrases from the
 * `t` passed by the caller.
 */
export function formatRelativeResetDay(isoDate: string, t: Translate): string {
  const resetAt = new Date(isoDate);
  const now = new Date();
  const resetDayMs = Date.UTC(
    resetAt.getUTCFullYear(),
    resetAt.getUTCMonth(),
    resetAt.getUTCDate()
  );
  const currentDayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const delayDays = Math.round((resetDayMs - currentDayMs) / ONE_DAY_MS);

  const locale = getActiveLocale();

  if (delayDays < 2) {
    return formatRelativeTime(
      Math.max(delayDays, 0),
      "day",
      { numeric: "auto" },
      locale
    );
  }
  if (delayDays < 7) {
    const weekday = formatDate(
      resetAt,
      { weekday: "long", timeZone: "UTC" },
      locale
    );
    return t(msg`on ${weekday}`);
  }
  const date = formatDate(
    resetAt,
    { month: "short", day: "numeric", timeZone: "UTC" },
    locale
  );
  return t(msg`on ${date}`);
}

// Browser display only: tolerates an unrecognized timeframe (the server may
// add new plan literals before the client is updated) by falling back to a
// 30-day window instead of crashing the app.
export function getTimeframeSecondsFromLiteral(
  timeframeLiteral: MaxMessagesTimeframeType | MaxAwuCreditsTimeframeType
): number {
  // Widen the key type: this guards against a timeframe value that bypassed
  // the static type (e.g. a server-added plan literal the client doesn't
  // know about yet), which TIMEFRAME_SECONDS's own exhaustive-by-construction
  // typing can't otherwise express as lookupable.
  const seconds = (TIMEFRAME_SECONDS as Record<string, number | undefined>)[
    timeframeLiteral
  ];
  if (seconds === undefined) {
    assertNeverAndIgnore(timeframeLiteral as never);
    return 60 * 60 * 24 * 30; // Unknown timeframe: fall back to 30 days.
  }
  return seconds;
}
