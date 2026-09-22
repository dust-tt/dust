import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
} from "@app/types/plan";
import { TIMEFRAME_SECONDS } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";

// Format a number of AWU credits for display (thousands separators, at most
// one decimal). Shared across the credits usage table and the message /
// conversation cost menu entries.
export function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// Format AWU credits with exactly one decimal (e.g. "310.0"), so values in
// per-message average columns stay visually consistent.
export function formatAvgCredits(credits: number): string {
  return credits.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// Format AWU credits with full fractional precision (up to 6 decimals,
// trailing zeros trimmed). Used by Poke debugging views that surface
// microcredit-derived figures (e.g. the rate-limiter counter), where an
// integer-rounded display would hide fractional-credit divergence.
export function formatCreditsPrecise(credits: number): string {
  return credits.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function formatCreditValue(credits: number): string {
  const formattedCredits = formatCredits(credits);
  const displayedCredits = Number(formattedCredits.replaceAll(",", ""));
  return `${formattedCredits} credit${pluralize(displayedCredits)}`;
}

export function toolUsageLabel(callCount: number): string {
  return `${callCount} use${pluralize(callCount)}`;
}

// Short recurring-period label for a fair-use timeframe (e.g. "per day").
// Returns an empty string for the "lifetime" sentinel, which has no period.
export function formatFairUseTimeframe(
  timeframe: MaxAwuCreditsTimeframeType
): string {
  switch (timeframe) {
    case "day":
      return "per day";
    case "week":
      return "per week";
    case "month":
      return "per month";
    case "lifetime":
      return "";
    default:
      assertNeverAndIgnore(timeframe);
      return "";
  }
}

export function formatLimitTimeframe(
  timeframe: MaxAwuCreditsTimeframeType,
  variant: "sentence" | "compact" = "sentence"
): string {
  let windowLabel: string;
  switch (timeframe) {
    case "day":
      windowLabel = "24 hours";
      break;
    case "week":
      windowLabel = "7 days";
      break;
    case "month":
      windowLabel = "30 days";
      break;
    case "lifetime":
      return variant === "compact"
        ? "on your current plan"
        : "for your current plan";
    default:
      assertNeverAndIgnore(timeframe);
      return "";
  }

  return variant === "compact"
    ? `in the last ${windowLabel}`
    : `over the past ${windowLabel}`;
}

export function formatCreditsCompact(credits: number): string {
  return credits.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatMicroUsdCompact(microUsd: number): string {
  const dollars = microUsd / 1_000_000;
  return `$${dollars.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  })}`;
}

// Relative UTC day label for a reset/refill date: "today", "tomorrow", a
// weekday within the week ("on Monday"), or the calendar date beyond that
// ("on Oct 6"). Shared by the fair-use and premium-usage reset copy.
export function formatRelativeResetDay(isoDate: string): string {
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

  if (delayDays <= 0) {
    return "today";
  }
  if (delayDays === 1) {
    return "tomorrow";
  }
  if (delayDays < 7) {
    return `on ${resetAt.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    })}`;
  }
  return `on ${resetAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })}`;
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
