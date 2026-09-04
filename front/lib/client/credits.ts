import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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
  return `${formattedCredits} credit${formattedCredits === "1" ? "" : "s"}`;
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

export function formatFairUseAllowance(
  timeframe: MaxAwuCreditsTimeframeType
): string {
  switch (timeframe) {
    case "day":
      return "Daily allowance";
    case "week":
      return "Weekly allowance";
    case "month":
    case "lifetime":
      return "Monthly allowance";
    default:
      assertNeverAndIgnore(timeframe);
      return "Usage allowance";
  }
}

export function formatCreditResetCountdown(
  nextResetAt: string,
  nowMs = Date.now()
): string | null {
  const nextResetAtMs = Date.parse(nextResetAt);
  if (!Number.isFinite(nextResetAtMs)) {
    return null;
  }

  const daysUntilReset = Math.max(
    0,
    Math.ceil((nextResetAtMs - nowMs) / (24 * 60 * 60 * 1000))
  );

  if (daysUntilReset === 0) {
    return "Reset today";
  }

  return `Reset in ${daysUntilReset} day${pluralize(daysUntilReset)}`;
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
