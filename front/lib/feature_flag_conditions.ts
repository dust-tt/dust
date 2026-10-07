import {
  isBusinessPlanPrefix,
  isCreditPricedPlanPrefix,
  isEnterprisePlanPrefix,
  isFreePlan,
  isProPlanPrefix,
} from "@app/lib/plans/plan_codes";
import type { PlanType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * @cc [owner:adrsimon,label:product] workspace-level-data-only
 * `FeatureFlagContext` MUST only hold workspace-level data. It MUST NOT hold the user, the role or
 * anything else that differs between two evaluations of the same workspace, so that a web request
 * and a background job resolve the same flags.
 */
export type FeatureFlagContext = {
  workspace: LightWorkspaceType;
  plan: PlanType | null;
};

export const FEATURE_FLAG_CONDITIONS = {
  credit_priced_plan: ({ plan }) =>
    plan !== null && isCreditPricedPlanPrefix(plan.code),
  enterprise_plan: ({ plan }) =>
    plan !== null && isEnterprisePlanPrefix(plan.code),
  business_plan: ({ plan }) => plan !== null && isBusinessPlanPrefix(plan.code),
  legacy_pro_plan: ({ plan }) => plan !== null && isProPlanPrefix(plan.code),
  free_plan: ({ plan }) => plan !== null && isFreePlan(plan.code),
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

export function meetsFeatureFlagConditions(
  conditions: string[],
  context: FeatureFlagContext
): boolean {
  return conditions.every(
    (condition) =>
      isFeatureFlagCondition(condition) &&
      FEATURE_FLAG_CONDITIONS[condition](context)
  );
}
