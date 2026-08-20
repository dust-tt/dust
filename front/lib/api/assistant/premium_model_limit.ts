import type { AgentMessageModelResolution } from "@app/lib/api/assistant/conversation/messages";
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
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import type { ResolvedRequestedModel } from "@app/types/assistant/models/types";
import { isCreditPricedPlan } from "@app/types/plan";

export type PremiumModelFairUseDecision =
  | { action: "run_as_requested" }
  | {
      action: "downgrade";
      resolution: AgentMessageModelResolution;
      requested: ResolvedRequestedModel;
    }
  | { action: "refuse"; limit: number; windowSeconds: number };

export function premiumModelLimitMessage(): string {
  return (
    `You have reached the limit of ${PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK} messages ` +
    `per week on premium models. Pick another model or try again later.`
  );
}

export async function applyPremiumModelFairUse(
  auth: Authenticator,
  {
    user,
    resolution,
    context,
  }: {
    user: UserResource;
    resolution: AgentMessageModelResolution;
    context: UserMessageContext;
  }
): Promise<PremiumModelFairUseDecision> {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  if (
    isCreditPricedPlan(plan) ||
    isFreeOrigin(context.origin) ||
    isProgrammaticUsage(auth, { userMessageOrigin: context.origin })
  ) {
    return { action: "run_as_requested" };
  }

  const { resolvedModel } = resolution;
  const tierName = ModelsTierResource.getTierForModel(
    resolvedModel.modelId,
    resolvedModel.reasoningEffort
  );
  if (tierName !== "premium") {
    return { action: "run_as_requested" };
  }

  const remaining = await rateLimiter({
    key: makePremiumModelMessageRateLimitKeyForUser(workspace, user.toJSON()),
    maxPerTimeframe: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
    timeframeSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
    logger,
  });

  if (remaining > 0) {
    return { action: "run_as_requested" };
  }

  const featureFlags = await getFeatureFlags(auth);
  const isBlocked = featureFlags.includes(
    "enforce_premium_model_message_limit"
  );

  logger.info(
    {
      workspaceId: workspace.sId,
      userId: user.sId,
      limit: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
      modelId: resolvedModel.modelId,
      reasoningEffort: resolvedModel.reasoningEffort,
      origin: context.origin,
      isBlocked,
    },
    "[PremiumModelLimit] Premium model weekly limit reached."
  );

  if (isBlocked) {
    return {
      action: "refuse",
      limit: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
      windowSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
    };
  }

  return { action: "run_as_requested" };
}
