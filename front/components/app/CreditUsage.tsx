import type { CreditUsageCardVariant } from "@app/components/app/CreditUsageCard";
import { CreditUsageCard } from "@app/components/app/CreditUsageCard";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";

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
}

export function CreditUsage({ state, variant }: CreditUsageProps) {
  const resetUnit = state.resetInDays === 1 ? "day" : "days";
  const companionStatusLabel =
    variant === "companion" && state.target !== "on_target"
      ? COMPANION_STATUS_LABELS[state.target]
      : null;

  return (
    <CreditUsageCard
      label="Credits"
      usedPercentage={state.usedPercentage}
      tone={state.target}
      variant={variant}
    >
      {companionStatusLabel ? `${companionStatusLabel} · ` : null}
      {RESET_LABEL_PREFIX[variant]} in {state.resetInDays} {resetUnit}
    </CreditUsageCard>
  );
}
