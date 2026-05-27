import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

export type EffectiveSpendLimitSource = "override" | "default" | "none";

export type SpendLimitAlertState = CustomerAlert["customer_status"];

export function resolveEffectiveSpendLimitAwuCredits({
  overrideAwuCredits,
  defaultAwuCredits,
}: {
  overrideAwuCredits: number | null;
  defaultAwuCredits: number | null;
}): number | null {
  if (overrideAwuCredits !== null) {
    return overrideAwuCredits;
  }
  return defaultAwuCredits;
}

export function resolveEffectiveSpendLimitState({
  overrideState,
  defaultState,
}: {
  overrideState: SpendLimitAlertState | undefined;
  defaultState: SpendLimitAlertState | undefined;
}): {
  state: SpendLimitAlertState;
  source: EffectiveSpendLimitSource;
} {
  if (overrideState !== undefined) {
    return { state: overrideState, source: "override" };
  }

  if (defaultState !== undefined) {
    return { state: defaultState, source: "default" };
  }

  return { state: "ok", source: "none" };
}
