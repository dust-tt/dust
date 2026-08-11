import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

export type EffectiveSpendLimitSource =
  | "override"
  | "group"
  | "default"
  | "none";

type SpendLimitAlertState = CustomerAlert["customer_status"];

// Priority: an explicit `overrideUnlimited` bypasses everything below it (no
// cap at all) > per-user `override` amount > the highest of the user's `group`
// caps > seat-type `default`. `groupCapAwuCredits` is the max cap across the
// groups the user belongs to (null when none of them carry a cap). All three
// numeric values must be expressed in the same unit (all pool-only, or all
// pool + seat allowance).
export function resolveEffectiveSpendLimitAwuCredits({
  overrideAwuCredits,
  overrideUnlimited,
  groupCapAwuCredits,
  defaultAwuCredits,
}: {
  overrideAwuCredits: number | null;
  overrideUnlimited: boolean;
  groupCapAwuCredits: number | null;
  defaultAwuCredits: number | null;
}): number | null {
  if (overrideUnlimited) {
    return null;
  }
  if (overrideAwuCredits !== null) {
    return overrideAwuCredits;
  }
  if (groupCapAwuCredits !== null) {
    return groupCapAwuCredits;
  }
  return defaultAwuCredits;
}

// Where the effective spend limit comes from: a user-specific `override`
// (amount-capped or explicitly unlimited), a `group` cap, the seat-type
// `default`, or `none` when nothing is configured (unlimited).
export function resolveEffectiveSpendLimitSource({
  overrideAwuCredits,
  overrideUnlimited,
  groupCapAwuCredits,
  defaultAwuCredits,
}: {
  overrideAwuCredits: number | null;
  overrideUnlimited: boolean;
  groupCapAwuCredits: number | null;
  defaultAwuCredits: number | null;
}): EffectiveSpendLimitSource {
  if (overrideUnlimited || overrideAwuCredits !== null) {
    return "override";
  }
  if (groupCapAwuCredits !== null) {
    return "group";
  }
  if (defaultAwuCredits !== null) {
    return "default";
  }
  return "none";
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
