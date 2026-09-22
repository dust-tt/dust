import type { CreditUsageCardVariant } from "@app/components/app/CreditUsageCard";
import { CreditUsageCard } from "@app/components/app/CreditUsageCard";
import {
  formatCredits,
  formatLimitTimeframe,
  formatRelativeResetDay,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/client/credits";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { Button } from "@dust-tt/sparkle";

interface CreditUsageStateBase {
  usedPercentage: number;
}

interface BillingPeriodCreditUsageState extends CreditUsageStateBase {
  kind: "billing_period";
  resetInDays: number;
  target: CreditUsageTarget;
}

interface RollingWindowCreditUsageState extends CreditUsageStateBase {
  kind: "rolling_window";
  usedCredits: number;
  limitCredits: number;
  timeframe: MaxAwuCreditsTimeframeType;
  // Upcoming credit refills, oldest first. Only meaningful for a true rolling
  // window (day/week/month) - omitted for the "lifetime" free-seat case, which
  // never refills.
  refillSchedule?: { date: string; credits: number }[];
  // When true the cap uses a fixed window instead of a rolling day count.
  isFixedWindow?: boolean;
  nextResetAt?: string | null;
}

export type CreditUsageState =
  | BillingPeriodCreditUsageState
  | RollingWindowCreditUsageState;

export const CREDIT_USAGE_LEARN_MORE_LABEL = "See your usage";

const RESET_LABEL_PREFIX: Record<CreditUsageCardVariant, string> = {
  profile_menu: "Reset",
  companion: "Credit reset",
};

const COMPANION_STATUS_LABELS: Record<
  Exclude<CreditUsageTarget, "on_target">,
  string
> = {
  elevated: "Usage is above target",
  critical: "Usage is well above target",
};

interface CreditUsageProps {
  state: CreditUsageState;
  variant: CreditUsageCardVariant;
  onLearnMore?: () => void;
}

export function CreditUsageLearnMoreButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      label={CREDIT_USAGE_LEARN_MORE_LABEL}
      variant="outline"
      size="sm"
      className="w-full"
      onClick={onClick}
    />
  );
}

function getBillingPeriodUsageDescription(
  state: BillingPeriodCreditUsageState,
  variant: CreditUsageCardVariant
): string {
  const resetUnit = `day${pluralize(state.resetInDays)}`;
  const companionStatusLabel =
    variant === "companion" && state.target !== "on_target"
      ? COMPANION_STATUS_LABELS[state.target]
      : null;
  const statusLabel = companionStatusLabel ? `${companionStatusLabel} · ` : "";

  return `${statusLabel}${RESET_LABEL_PREFIX[variant]} in ${state.resetInDays} ${resetUnit}`;
}

// The free-seat lifetime cap shares the rolling_window kind's state shape
// (used/limit credits) but never refills, so it gets its own description
// rather than a rolling-window day count.
function getLifetimeUsageDescription(
  state: RollingWindowCreditUsageState
): string {
  return `${formatCredits(state.usedCredits)} of ${formatCredits(state.limitCredits)} used ${formatLimitTimeframe(state.timeframe, "compact")}`;
}

function getRollingWindowUsageDescription(
  state: RollingWindowCreditUsageState
): string {
  if (state.timeframe === "lifetime") {
    return getLifetimeUsageDescription(state);
  }
  if (state.isFixedWindow && state.nextResetAt) {
    return `Resets ${formatRelativeResetDay(state.nextResetAt)}`;
  }
  const windowDays =
    getTimeframeSecondsFromLiteral(state.timeframe) / (24 * 60 * 60);
  return `Resets on a rolling ${windowDays}-day basis`;
}

function getUsageDescription(
  state: CreditUsageState,
  variant: CreditUsageCardVariant
): string {
  switch (state.kind) {
    case "billing_period":
      return getBillingPeriodUsageDescription(state, variant);
    case "rolling_window":
      return getRollingWindowUsageDescription(state);
    default:
      assertNeverAndIgnore(state);
      return "";
  }
}

export function CreditUsage({ state, variant, onLearnMore }: CreditUsageProps) {
  const usageDescription = getUsageDescription(state, variant);
  const tone = state.kind === "billing_period" ? state.target : "on_target";
  const refillSchedule =
    state.kind === "rolling_window" ? state.refillSchedule : undefined;

  return (
    <CreditUsageCard
      label="Credits"
      usedPercentage={state.usedPercentage}
      tone={tone}
      variant={variant}
      refillSchedule={refillSchedule}
    >
      {onLearnMore ? (
        <div className="flex flex-col gap-2">
          <span>{usageDescription}</span>
          <CreditUsageLearnMoreButton onClick={onLearnMore} />
        </div>
      ) : (
        usageDescription
      )}
    </CreditUsageCard>
  );
}
