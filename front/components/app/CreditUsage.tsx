import type { CreditUsageCardVariant } from "@app/components/app/CreditUsageCard";
import { CreditUsageCard } from "@app/components/app/CreditUsageCard";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import { Button } from "@dust-tt/sparkle";

export interface CreditUsageState {
  usedPercentage: number;
  resetInDays: number;
  target: CreditUsageTarget;
}

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

export function CreditUsage({ state, variant, onLearnMore }: CreditUsageProps) {
  const resetUnit = state.resetInDays === 1 ? "day" : "days";
  const companionStatusLabel =
    variant === "companion" && state.target !== "on_target"
      ? COMPANION_STATUS_LABELS[state.target]
      : null;
  const statusLabel = companionStatusLabel ? `${companionStatusLabel} · ` : "";
  const resetLabel = `${statusLabel}${RESET_LABEL_PREFIX[variant]} in ${state.resetInDays} ${resetUnit}`;

  return (
    <CreditUsageCard
      label="Credits"
      usedPercentage={state.usedPercentage}
      tone={state.target}
      variant={variant}
    >
      {onLearnMore ? (
        <div className="flex flex-col gap-2">
          <span>{resetLabel}</span>
          <Button
            label="Learn more"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onLearnMore}
          />
        </div>
      ) : (
        resetLabel
      )}
    </CreditUsageCard>
  );
}
