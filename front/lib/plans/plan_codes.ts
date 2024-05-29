import type { PlanType } from "@dust-tt/types";

// Current free plans:
export const FREE_NO_PLAN_CODE = "FREE_NO_PLAN";
export const FREE_UPGRADED_PLAN_CODE = "FREE_UPGRADED_PLAN";
export const FREE_TEST_PLAN_CODE = "FREE_TEST_PLAN";
export const TRIAL_PLAN_CODE = "TRIAL_PLAN_CODE";

// Current pro plans:
export const PRO_PLAN_SEAT_29_CODE = "PRO_PLAN_SEAT_29";
export const PRO_PLAN_LARGE_FILES_CODE = "PRO_PLAN_LARGE_FILES";

/**
 * ENT_PLAN_FAKE is not subscribable and is only used to display the Enterprise plan in the UI (hence it's not stored on the db).
 */
export const ENT_PLAN_FAKE_CODE = "ENT_PLAN_FAKE_CODE";

/**
 * `isUpgraded` returns true if the plan has access to all features of Dust, including large
 * language models (meaning it's either a paid plan or free plan with (eg friends and family, or
 * free trial plan)).
 *
 * Note: We didn't go for isFree or isPayingWorkspace as we have "upgraded" plans that are free.
 */
export const isUpgraded = (plan: PlanType | null): boolean => {
  if (!plan) {
    return false;
  }
  return ![FREE_TEST_PLAN_CODE, FREE_NO_PLAN_CODE].includes(plan.code);
};
