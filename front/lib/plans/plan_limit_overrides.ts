import type { PlanAttributes } from "@app/lib/plans/free_plans";

/**
 * The plan limits that can be overridden per workspace. Keys are `PlanModel`
 * column names so that merging is a plain field copy.
 */
export const OVERRIDABLE_PLAN_LIMITS = [
  "maxUsersInWorkspace",
  "maxFreeUsersInWorkspace",
  "maxLifetimeFreeUsersInWorkspace",
  "maxVaultsInWorkspace",
  "maxDataSourcesCount",
  "maxConnectionsCount",
] as const satisfies readonly (keyof PlanAttributes)[];

export type OverridablePlanLimit = (typeof OVERRIDABLE_PLAN_LIMITS)[number];

/**
 * The plan feature gates that can be overridden per workspace. Same mechanism
 * as {@link OVERRIDABLE_PLAN_LIMITS}, but the value is a boolean: `true` grants
 * the feature to a workspace whose plan does not include it, and `false` denies
 * it to one whose plan does.
 */
export const OVERRIDABLE_PLAN_FLAGS = [
  "isSSOAllowed",
  "isSCIMAllowed",
] as const satisfies readonly (keyof PlanAttributes)[];

export type OverridablePlanFlag = (typeof OVERRIDABLE_PLAN_FLAGS)[number];

/**
 * A per-workspace override of the plan limits and feature gates. `null` means
 * "not overridden, use the plan value"; for limits `-1` keeps its plan meaning
 * (unlimited).
 */
export type PlanLimitOverride = Record<OverridablePlanLimit, number | null> &
  Record<OverridablePlanFlag, boolean | null>;

export const EMPTY_PLAN_LIMIT_OVERRIDE: PlanLimitOverride = {
  maxUsersInWorkspace: null,
  maxFreeUsersInWorkspace: null,
  maxLifetimeFreeUsersInWorkspace: null,
  maxVaultsInWorkspace: null,
  maxDataSourcesCount: null,
  maxConnectionsCount: null,
  isSSOAllowed: null,
  isSCIMAllowed: null,
};

export function hasAnyPlanLimitOverride(override: PlanLimitOverride): boolean {
  return (
    OVERRIDABLE_PLAN_LIMITS.some((key) => override[key] !== null) ||
    OVERRIDABLE_PLAN_FLAGS.some((key) => override[key] !== null)
  );
}

/**
 * Applies a workspace's plan-limit and feature-gate overrides on top of the plan
 * attributes. Applied last when resolving the plan for a workspace — after the
 * trial limits of `getTrialVersionForPlan` — so an explicit override always
 * wins.
 */
export function applyPlanLimitOverrides(
  plan: PlanAttributes,
  override: PlanLimitOverride | null
): PlanAttributes {
  if (!override) {
    return plan;
  }

  const overridden = { ...plan };
  for (const key of OVERRIDABLE_PLAN_LIMITS) {
    const value = override[key];
    if (value !== null) {
      overridden[key] = value;
    }
  }
  for (const key of OVERRIDABLE_PLAN_FLAGS) {
    const value = override[key];
    if (value !== null) {
      overridden[key] = value;
    }
  }

  return overridden;
}
