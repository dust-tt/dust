import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import { recordProgrammaticSpendLimitUsage } from "@app/lib/api/credits/programmatic_usage_limit";
import { recordApiKeySpendLimitUsage } from "@app/lib/api/keys/spend_limit";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import { recordUserSpendLimitUsage } from "@app/lib/api/users/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { spendLimitCycleOverrideForAuth } from "@app/lib/spend_limits/cycle";
import {
  addRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

export async function recordExecutionCreditCounters(
  auth: Authenticator,
  {
    agentMessageModelId,
    creditAmount,
    runKey,
    userMessageOrigin,
  }: {
    agentMessageModelId: ModelId;
    creditAmount: number;
    runKey: string;
    userMessageOrigin: UserMessageOrigin;
  }
): Promise<void> {
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    return;
  }

  const user = auth.user();
  const assistantLimits = auth.plan()?.limits.assistant;
  const featureFlags = await getFeatureFlags(auth);
  const idempotencyKey = `consumption:${agentMessageModelId}:${runKey}`;

  if (
    user &&
    assistantLimits &&
    assistantLimits.maxAwuCredits !== -1 &&
    !featureFlags.includes("disable_fair_use_awu_limit")
  ) {
    await addRateLimiterCount({
      key: makeFairUseAwuCreditsRateLimitKeyForUser(
        auth.getNonNullableWorkspace(),
        user.toJSON(),
        assistantLimits.maxAwuCreditsTimeframe
      ),
      timeframeSeconds: getTimeframeSecondsFromLiteral(
        assistantLimits.maxAwuCreditsTimeframe
      ),
      incrementBy: creditAmount,
      idempotencyKey,
      throwOnError: true,
      logger,
    });
  }

  if (!featureFlags.includes("enforce_user_spend_limit_rate_cap")) {
    return;
  }

  if (user) {
    await recordUserSpendLimitUsage(auth, {
      user,
      incrementBy: creditAmount,
      cycle: spendLimitCycleOverrideForAuth(auth),
      idempotencyKey,
      throwOnError: true,
    });
  }

  const apiKey = auth.key();
  if (apiKey) {
    await recordApiKeySpendLimitUsage(auth, {
      keyModelId: apiKey.id,
      incrementBy: creditAmount,
      idempotencyKey,
      throwOnError: true,
    });
  }

  if (isProgrammaticUsage(auth, { userMessageOrigin })) {
    await recordProgrammaticSpendLimitUsage(auth, {
      incrementBy: creditAmount,
      idempotencyKey,
      throwOnError: true,
    });
  }
}
