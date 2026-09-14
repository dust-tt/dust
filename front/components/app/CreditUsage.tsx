import type { CreditUsageCardVariant } from "@app/components/app/CreditUsageCard";
import { CreditUsageCard } from "@app/components/app/CreditUsageCard";
import { formatCredits, formatLimitTimeframe } from "@app/lib/client/credits";
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

function getUsageDescription(
  state: CreditUsageState,
  variant: CreditUsageCardVariant
): string {
  switch (state.kind) {
    case "billing_period": {
      const resetUnit = `day${pluralize(state.resetInDays)}`;
      const companionStatusLabel =
        variant === "companion" && state.target !== "on_target"
          ? COMPANION_STATUS_LABELS[state.target]
          : null;
      const statusLabel = companionStatusLabel
        ? `${companionStatusLabel} · `
        : "";

      return `${statusLabel}${RESET_LABEL_PREFIX[variant]} in ${state.resetInDays} ${resetUnit}`;
    }
    case "rolling_window":
      return `${formatCredits(state.usedCredits)} of ${formatCredits(state.limitCredits)} used ${formatLimitTimeframe(state.timeframe, "compact")}`;
    default:
      assertNeverAndIgnore(state);
      return "";
  }
}

export function CreditUsage({ state, variant, onLearnMore }: CreditUsageProps) {
  const usageDescription = getUsageDescription(state, variant);
  const tone = state.kind === "billing_period" ? state.target : "on_target";

  return (
    <CreditUsageCard
      label="Credits"
      usedPercentage={state.usedPercentage}
      tone={tone}
      variant={variant}
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
