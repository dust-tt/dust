import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import { maybeProactivelyAutoUpgradeSeatOnCapReached } from "@app/lib/api/credits/auto_seat_upgrade";
import { recordProgrammaticSpendLimitUsage } from "@app/lib/api/credits/programmatic_usage_limit";
import { recordApiKeySpendLimitUsage } from "@app/lib/api/keys/spend_limit";
import { PostHogServerSideTracking } from "@app/lib/api/posthog";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import {
  recordFreeSeatLifetimeUsage,
  recordUserSpendLimitUsage,
} from "@app/lib/api/users/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { spendLimitCycleOverrideForAuth } from "@app/lib/spend_limits/cycle";
import {
  addRateLimiterCount,
  getTimeframeSecondsFromLiteral,
  getWeightedRateLimiterUsage,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";

/**
 * @cc [owner:id13,label:backend;product] fair-use-settled-consumption
 * When the plan has a per-user AWU limit, the supplied credit amount MUST be recorded against the
 * same fair-use Redis key read by message enforcement and usage status.
 */
export async function recordAgentMessageCreditCounters(
  auth: Authenticator,
  {
    creditAmount,
    idempotencyKey,
    throwOnError = false,
    userMessageOrigin,
  }: {
    creditAmount: number;
    idempotencyKey?: string;
    throwOnError?: boolean;
    userMessageOrigin: UserMessageOrigin;
  }
): Promise<void> {
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    return;
  }

  const user = auth.user();
  const assistantLimits = auth.plan()?.limits.assistant;
  const featureFlags = await getFeatureFlags(auth);

  if (
    user &&
    assistantLimits &&
    assistantLimits.maxAwuCredits !== -1 &&
    !featureFlags.includes("disable_fair_use_awu_limit")
  ) {
    const key = makeFairUseAwuCreditsRateLimitKeyForUser(
      auth.getNonNullableWorkspace(),
      user.toJSON(),
      assistantLimits.maxAwuCreditsTimeframe
    );
    const timeframeSeconds = getTimeframeSecondsFromLiteral(
      assistantLimits.maxAwuCreditsTimeframe
    );
    await addRateLimiterCount({
      key,
      timeframeSeconds,
      incrementBy: creditAmount,
      idempotencyKey,
      throwOnError,
      logger,
    });

    const usage = await getWeightedRateLimiterUsage({ key, timeframeSeconds });
    const limitMicroCredits = roundCreditsToMicroCredits(
      assistantLimits.maxAwuCredits
    );
    if (
      usage.isOk() &&
      usage.value.count >= limitMicroCredits &&
      usage.value.count - roundCreditsToMicroCredits(creditAmount) <
        limitMicroCredits
    ) {
      PostHogServerSideTracking.trackEvent({
        distinctId: user.sId,
        event: "fair_use_limit_reached",
        workspaceId: auth.getNonNullableWorkspace().sId,
        extra: {
          limit_credits: assistantLimits.maxAwuCredits,
          timeframe: assistantLimits.maxAwuCreditsTimeframe,
          used_credits: microCreditsToCredits(usage.value.count),
          burn_duration_hours: usage.value.oldestTimestampMs
            ? (Date.now() - usage.value.oldestTimestampMs) / (60 * 60 * 1000)
            : 0,
          origin: userMessageOrigin,
        },
      });
    }
  }

  if (user) {
    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: auth.getNonNullableWorkspace(),
      });
    if (membership?.seatType === "free") {
      await recordFreeSeatLifetimeUsage(auth, {
        user,
        incrementBy: creditAmount,
        idempotencyKey,
        throwOnError,
      });
    } else {
      await recordUserSpendLimitUsage(auth, {
        user,
        incrementBy: creditAmount,
        cycle: spendLimitCycleOverrideForAuth(auth),
        idempotencyKey,
        throwOnError,
      });
    }
    void maybeProactivelyAutoUpgradeSeatOnCapReached(auth, { user });
  }

  const apiKey = auth.keyForUsageAttribution();
  if (apiKey) {
    await recordApiKeySpendLimitUsage(auth, {
      keyModelId: apiKey.id,
      incrementBy: creditAmount,
      idempotencyKey,
      throwOnError,
    });
  }

  if (isProgrammaticUsage(auth, { userMessageOrigin })) {
    await recordProgrammaticSpendLimitUsage(auth, {
      incrementBy: creditAmount,
      idempotencyKey,
      throwOnError,
    });
  }
}
