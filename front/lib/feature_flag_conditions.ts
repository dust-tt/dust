import {
  isCreditPricedPlanPrefix,
  isEnterprisePlanPrefix,
} from "@app/lib/plans/plan_codes";
import type { PlanType } from "@app/types/plan";

/**
 * @cc [owner:adrsimon,label:product] workspace-level-data-only
 * `FeatureFlagContext` MUST only hold workspace-level data. It MUST NOT hold the user, the role or
 * anything else that differs between two callers evaluating the same workspace.
 */
/**
 * @cc [owner:adrsimon,label:product] unknown-plan-fails-conditions
 * `plan` is `null` when the caller cannot load the workspace's plan (public unauthenticated paths).
 * Every plan-based condition MUST evaluate to false for a `null` plan.
 */
export type FeatureFlagContext = {
  plan: PlanType | null;
};

export const FEATURE_FLAG_CONDITIONS = {
  enterprise: ({ plan }) => plan !== null && isEnterprisePlanPrefix(plan.code),
  non_enterprise: ({ plan }) =>
    plan !== null && !isEnterprisePlanPrefix(plan.code),
  credit_priced_plans: ({ plan }) =>
    plan !== null && isCreditPricedPlanPrefix(plan.code),
  legacy_plans: ({ plan }) =>
    plan !== null && !isCreditPricedPlanPrefix(plan.code),
} satisfies Record<string, (context: FeatureFlagContext) => boolean>;

export type FeatureFlagCondition = keyof typeof FEATURE_FLAG_CONDITIONS;

export const FEATURE_FLAG_CONDITION_NAMES = Object.keys(
  FEATURE_FLAG_CONDITIONS
).filter(isFeatureFlagCondition);

export function isFeatureFlagCondition(
  value: string
): value is FeatureFlagCondition {
  return Object.hasOwn(FEATURE_FLAG_CONDITIONS, value);
}

export function meetsFeatureFlagCondition(
  condition: string | null,
  context: FeatureFlagContext
): boolean {
  if (condition === null) {
    return true;
  }
  return (
    isFeatureFlagCondition(condition) &&
    FEATURE_FLAG_CONDITIONS[condition](context)
  );
}
