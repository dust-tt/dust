import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";

// Format a number of AWU credits for display (thousands separators, at most
// one decimal). Shared across the credits usage table and the message /
// conversation cost menu entries.
export function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export type CreditUsageDisplayTarget = "on_target" | "off_target";

export function getCreditUsageDisplayTarget(
  target: CreditUsageTarget
): CreditUsageDisplayTarget {
  switch (target) {
    case "on_target":
      return "on_target";
    case "elevated":
    case "critical":
      return "off_target";
    default:
      assertNeverAndIgnore(target);
      return "off_target";
  }
}

export function formatCreditValue(credits: number): string {
  return `${formatCredits(credits)} credit${pluralize(credits)}`;
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
