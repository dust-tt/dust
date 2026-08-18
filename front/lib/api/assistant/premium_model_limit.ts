import {
  makePremiumModelMessageRateLimitKeyForUser,
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
} from "@app/lib/api/assistant/rate_limits";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isFreeOrigin } from "@app/lib/credits/agent_message_billing";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import {
  addRateLimiterCount,
  getRateLimiterCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import type { ResolvedRequestedModel } from "@app/types/assistant/models/types";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function checkPremiumModelMessageLimit(
  auth: Authenticator,
  {
    user,
    resolvedModel,
    context,
  }: {
    user: UserResource;
    resolvedModel: ResolvedRequestedModel;
    context: UserMessageContext;
  }
): Promise<Result<void, APIErrorWithContentfulStatusCode>> {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  if (
    isCreditPricedPlan(plan) ||
    isFreeOrigin(context.origin) ||
    isProgrammaticUsage(auth, { userMessageOrigin: context.origin })
  ) {
    return new Ok(undefined);
  }

  const tierName = ModelsTierResource.getTierForModel(
    resolvedModel.modelId,
    resolvedModel.reasoningEffort
  );
  if (tierName !== "premium") {
    return new Ok(undefined);
  }

  const key = makePremiumModelMessageRateLimitKeyForUser(
    workspace,
    user.toJSON()
  );
  const countResult = await getRateLimiterCount({
    key,
    timeframeSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
  });

  if (countResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        error: countResult.error,
      },
      "[PremiumModelLimit] Failed to read the premium model count; allowing message."
    );
  }

  if (
    countResult.isOk() &&
    countResult.value >= PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK
  ) {
    const featureFlags = await getFeatureFlags(auth);
    const isBlocked = featureFlags.includes(
      "enforce_premium_model_message_limit"
    );

    logger.info(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        count: countResult.value,
        limit: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
        modelId: resolvedModel.modelId,
        reasoningEffort: resolvedModel.reasoningEffort,
        origin: context.origin,
        isBlocked,
      },
      "[PremiumModelLimit] Premium model weekly limit reached."
    );

    if (isBlocked) {
      return new Err({
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message:
            `You have reached the limit of ${PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK} messages ` +
            `per week on premium models. Pick another model or try again later.`,
        },
      });
    }
  }

  await addRateLimiterCount({
    key,
    timeframeSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
    incrementBy: 1,
    logger,
  });

  return new Ok(undefined);
}
