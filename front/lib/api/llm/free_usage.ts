import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  awuFromMicroUsd,
  isFreeOrigin,
} from "@app/lib/credits/agent_message_billing";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { isEnterpriseOrDust } from "@app/lib/plans/plan_codes";
import {
  addRateLimiterCount,
  getWeightedRateLimiterCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

// Per-user daily cost cap on free (unbilled) LLM usage — utility calls
// (title/skill suggestions, etc.) and free agent calls (sidekick). Counted in
// AWU credits. Enterprise (and Dust internal) accounts get a higher allowance.
const FREE_USAGE_COST_WINDOW_SECONDS = 24 * 60 * 60;
const FREE_USAGE_AWU_CREDITS_LIMIT_PER_DAY = awuFromMicroUsd(5 * 1_000_000);
const ENTERPRISE_FREE_USAGE_AWU_CREDITS_LIMIT_PER_DAY = awuFromMicroUsd(
  50 * 1_000_000
);

function freeUsageAwuCreditsLimitForAuth(auth: Authenticator): number {
  return isEnterpriseOrDust(auth.plan())
    ? ENTERPRISE_FREE_USAGE_AWU_CREDITS_LIMIT_PER_DAY
    : FREE_USAGE_AWU_CREDITS_LIMIT_PER_DAY;
}

const makeFreeUsageCostRateLimitKeyForUser = (
  owner: LightWorkspaceType,
  userId: number
) => {
  // `:v2_microcredits` marks the switch to weighted amount-carrying entries
  // (`<microCredits>:<uuid>`, summed on read). Bumping the key prevents summing
  // the new entries together with legacy plain-uuid rows; the short rolling
  // window makes the pre-existing key expire quickly after cutover.
  return `workspace:${owner.id}:user:${userId}:free_usage_cost:v2_microcredits`;
};

// Whether an LLM call is free (unbilled). Two cases:
//   - Utility operations (title/skill suggestions, etc.) — anything other than
//     the agent conversation itself. They carry no userMessageOrigin, so they
//     are keyed off operationType.
//   - Agent conversations triggered by a free origin (e.g. sidekick).
// This is the single source of truth for classifying free usage at the LLM call
// site (used for both usage-type tagging and the free-usage cost cap).
export function isFreeUsageContext(context: LLMTraceContext): boolean {
  return (
    context.operationType !== "agent_conversation" ||
    isFreeOrigin(context.userMessageOrigin ?? null)
  );
}

// Whether a free LLM call must be blocked because the triggering user has hit
// the per-user daily free-usage cost cap. Callers check this *before* invoking
// the LLM (before getStreamLLM) and surface the block in their own error idiom.
//
// Enforcement (this gate) lives above the LLM router; the cost contribution to
// the counter lives with usage recording in the router. Only authenticated
// users on free calls are subject to the cap, and the
// `skip_free_usage_rate_limit` feature flag exempts a workspace entirely.
export async function isFreeUsageBlocked(
  auth: Authenticator,
  context: LLMTraceContext
): Promise<boolean> {
  const user = auth.user();
  if (!user || !isFreeUsageContext(context)) {
    return false;
  }

  const featureFlags = await getFeatureFlags(auth);
  if (featureFlags.includes("skip_free_usage_rate_limit")) {
    return false;
  }

  // Fails open on a Redis error so a transient failure never blocks usage. The
  // counter stores microCredits, so compare against the limit scaled the same
  // way.
  const result = await getWeightedRateLimiterCount({
    key: makeFreeUsageCostRateLimitKeyForUser(
      auth.getNonNullableWorkspace(),
      user.id
    ),
    timeframeSeconds: FREE_USAGE_COST_WINDOW_SECONDS,
  });
  if (result.isErr()) {
    return false;
  }
  return (
    result.value >=
    roundCreditsToMicroCredits(freeUsageAwuCreditsLimitForAuth(auth))
  );
}

// Contribute a free call's cost (converted to AWU credits) to the user's daily
// free-usage counter. No-op when the cost rounds to zero credits.
export async function contributeFreeUsageCostForUser(
  owner: LightWorkspaceType,
  userId: number,
  costMicroUsd: number
): Promise<void> {
  const awuCredits = awuFromMicroUsd(costMicroUsd);
  if (awuCredits <= 0) {
    return;
  }
  await addRateLimiterCount({
    key: makeFreeUsageCostRateLimitKeyForUser(owner, userId),
    timeframeSeconds: FREE_USAGE_COST_WINDOW_SECONDS,
    incrementBy: awuCredits,
    logger,
  });
}
