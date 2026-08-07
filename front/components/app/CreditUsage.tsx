import {
  CreditUsageCard,
  type CreditUsageCardVariant,
} from "@app/components/app/CreditUsageCard";
import type { CreditUsagePace } from "@app/types/api/credits/usage_status";

export interface CreditUsageState {
  usedPercentage: number;
  resetInDays: number;
  pace: CreditUsagePace;
}

const RESET_LABEL_PREFIX: Record<CreditUsageCardVariant, string> = {
  profile_menu: "Reset",
  companion: "Credit reset",
};

const COMPANION_STATUS_LABELS: Record<
  Exclude<CreditUsagePace, "on_pace">,
  string
> = {
  elevated: "Usage is above pace",
  critical: "Usage is well above pace",
};

interface CreditUsageProps {
  state: CreditUsageState;
  variant: CreditUsageCardVariant;
}

export function CreditUsage({ state, variant }: CreditUsageProps) {
  const resetUnit = state.resetInDays === 1 ? "day" : "days";
  const companionStatusLabel =
    variant === "companion" && state.pace !== "on_pace"
      ? COMPANION_STATUS_LABELS[state.pace]
      : null;

  return (
    <CreditUsageCard
      label="Credits"
      usedPercentage={state.usedPercentage}
      tone={state.pace}
      variant={variant}
    >
      {companionStatusLabel ? `${companionStatusLabel} · ` : null}
      {RESET_LABEL_PREFIX[variant]} in {state.resetInDays} {resetUnit}
    </CreditUsageCard>
  );
}
