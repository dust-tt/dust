import type { PlanType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";

// Current free plans:
export const FREE_NO_PLAN_CODE = "FREE_NO_PLAN";
export const FREE_UPGRADED_PLAN_CODE = "FREE_UPGRADED_PLAN";
export const FREE_TEST_PLAN_CODE = "FREE_TEST_PLAN"; // Old free plan that's no longer used
export const FREE_TRIAL_PHONE_PLAN_CODE = "FREE_TRIAL_PHONE_PLAN";

// Current pro plans:
export const PRO_PLAN_SEAT_29_CODE = "PRO_PLAN_SEAT_29";
export const PRO_PLAN_LARGE_FILES_CODE = "PRO_PLAN_LARGE_FILES";
export const PRO_PLAN_SEAT_39_CODE = "PRO_PLAN_SEAT_39";

// Legacy pro plans (kept for the legacy Pro → Business migration).
export const PRO_PLAN_LARGE_FILES_10SPACES_CODE =
  "PRO_PLAN_LARGE_FILES_10SPACES";
export const PRO_PLAN_PLUS_SEAT_29_CODE = "PRO_PLAN_PLUS_SEAT_29";

// Credit-priced plans:
export const CREDIT_PRICED_BUSINESS_PLAN_CODE = "CP_BUSINESS_PLAN";
// Business variant whose limits are permissive enough to fit any legacy PRO_*
// plan — used to migrate legacy Pro workspaces that exceed the standard Business
// plan limits (seats, spaces, data sources) without downgrading their limits.
export const CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE =
  "CP_BUSINESS_LEGACY_LARGE_PLAN";
export const CREDIT_PRICED_FREE_PLAN_CODE = "CP_FREE_PLAN";
export const CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE = "CP_ENT_DEFAULT_PLAN";
export const CREDIT_PRICED_DUST_COMPANY_PLAN_CODE = "CP_DUST_COMPANY";

// BYOK plan:
export const FREE_BYOK_TRANSITIONING_PLAN_CODE = "FREE_BYOK_TRANSITIONING";
export const FREE_BYOK_PLAN_CODE = "FREE_BYOK";

/**
 * ENT_PLAN_FAKE is not subscribable and is only used to display the Enterprise plan in the UI (hence it's not stored on the db).
 */
export const ENT_PLAN_FAKE_CODE = "ENT_PLAN_FAKE_CODE";

// Dust's own workspace plan.
export const DUST_COMPANY_PLAN_CODE = "DUST_COMPANY";

/** Plan codes excluded from reinforcement-related batch operations. */
export const REINFORCEMENT_EXCLUDED_PLAN_CODES = new Set([
  FREE_TRIAL_PHONE_PLAN_CODE,
]);

// Credit priced plan billed/tracked through Metronome and not legacy.
export const isCreditPricedPlanPrefix = (planCode: string) =>
  planCode.startsWith("CP_");

// If the plan code starts with ENT_, it's an enterprise plan
export const isEnterprisePlanPrefix = (planCode: string) =>
  planCode.startsWith("ENT_") || planCode.startsWith("CP_ENT_");

export const isDustCompanyPlan = (planCode: string) =>
  planCode === DUST_COMPANY_PLAN_CODE ||
  planCode === CREDIT_PRICED_DUST_COMPANY_PLAN_CODE;

// If the plan code starts with PRO_, it's a pro plan
export const isProPlanPrefix = (planCode: string) =>
  planCode.startsWith("PRO_");

// If the plan code is FREE_FRIENDSAMILY, it's a free friends and family plan
export const isFriendsAndFamilyPlan = (planCode: string) =>
  planCode === "FREE_FRIENDSAMILY";

export const isCreditPricedFreePlan = (planCode: string) =>
  planCode === CREDIT_PRICED_FREE_PLAN_CODE;

export const isBusinessPlanPrefix = (planCode: string) =>
  planCode.startsWith("CP_BUSINESS_");

// Everything else is free
export const isFreePlan = (planCode: string) =>
  !isEnterprisePlanPrefix(planCode) &&
  !isDustCompanyPlan(planCode) &&
  !isProPlanPrefix(planCode) &&
  !isBusinessPlanPrefix(planCode);

export const isFreeTrialPhonePlan = (planCode: string) =>
  planCode === FREE_TRIAL_PHONE_PLAN_CODE;

// Early plan when anyone could create a dust account
export const isOldFreePlan = (planCode: string) =>
  planCode === FREE_TEST_PLAN_CODE;

// Plan-type filter buckets exposed on the poke workspaces list, split by
// literal plan-code prefix rather than by the semantic `isXxx` helpers above:
// - enterprise: CP_ENT_*          (current, credit-priced enterprise)
// - legacy_enterprise: ENT_*      (legacy, pre-credit-priced enterprise)
// - legacy_pro: PRO_*             (legacy pro plans, incl. the "business" seat tier)
// - business: CP_BUSINESS_*       (current, credit-priced business)
// - free: FREE_*                  (all free-tier plans, incl. old-free), except F&F below
// - friends_and_family: FREE_FRIENDSAMILY
// - dust: DUST_* / CP_DUST_*      (Dust's own company workspace)
export const POKE_PLAN_TYPE_FILTERS = [
  "enterprise",
  "business",
  "legacy_enterprise",
  "legacy_pro",
  "free",
  "friends_and_family",
  "dust",
] as const;

export type PokePlanTypeFilter = (typeof POKE_PLAN_TYPE_FILTERS)[number];

export function isPokePlanTypeFilter(
  value: string
): value is PokePlanTypeFilter {
  return POKE_PLAN_TYPE_FILTERS.some((filter) => filter === value);
}

export type PokeNonFreePlanTypeFilter = Exclude<PokePlanTypeFilter, "free">;

// Single source of truth for how each non-free bucket maps to plan codes.
// Consumed to build the SQL filter for the poke workspaces list endpoint:
// `free` has no code pattern of its own there — it's derived as "doesn't
// match any of these".
export const POKE_PLAN_CODE_MATCHERS: Record<
  PokeNonFreePlanTypeFilter,
  { type: "prefix"; values: string[] } | { type: "exact"; values: string[] }
> = {
  enterprise: { type: "prefix", values: ["CP_ENT_"] },
  legacy_enterprise: { type: "prefix", values: ["ENT_"] },
  legacy_pro: { type: "prefix", values: ["PRO_"] },
  business: { type: "prefix", values: ["CP_BUSINESS_"] },
  friends_and_family: { type: "exact", values: ["FREE_FRIENDSAMILY"] },
  dust: { type: "prefix", values: ["DUST_", "CP_DUST_"] },
};

export function isProPlan(plan?: PlanType) {
  return (
    plan?.code === PRO_PLAN_SEAT_29_CODE ||
    plan?.code === PRO_PLAN_LARGE_FILES_CODE
  );
}

export const isByokTransitioningPlan = (plan?: PlanType) =>
  plan?.code === FREE_BYOK_TRANSITIONING_PLAN_CODE;

export function isBusinessPlan(plan?: PlanType) {
  return plan?.code === PRO_PLAN_SEAT_39_CODE;
}

export function isProOrBusinessPlanCode(plan?: PlanType) {
  return isProPlan(plan) || isBusinessPlan(plan);
}

/**
 * `isUpgraded` returns true if the plan has access to paid Dust features (meaning it's either a
 * paid plan or a free plan with upgraded access, such as friends and family or a free trial).
 * Plan-specific entitlements such as large-model access must use their dedicated checks instead.
 *
 * Note: We didn't go for isFree or isPayingWorkspace as we have "upgraded" plans that are free.
 */
export const isUpgraded = (plan: PlanType | null): boolean => {
  if (!plan) {
    return false;
  }
  return ![FREE_TEST_PLAN_CODE, FREE_NO_PLAN_CODE].includes(plan.code);
};

export function isEnterpriseOrDust(plan: PlanType | null): boolean {
  return (
    plan !== null &&
    (isEnterprisePlanPrefix(plan.code) || isDustCompanyPlan(plan.code))
  );
}

export const isWhitelistedBusinessPlan = (owner?: WorkspaceType) => {
  if (!owner) {
    return false;
  }
  return owner.metadata?.isBusiness === true;
};
