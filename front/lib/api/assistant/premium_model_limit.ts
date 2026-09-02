import type { AgentMessageModelResolution } from "@app/lib/api/assistant/conversation/messages";
import { getDegradedModelIds } from "@app/lib/api/assistant/degraded_models";
import {
  makePremiumModelMessageRateLimitKeyForUser,
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
  PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
} from "@app/lib/api/assistant/rate_limits";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isFreeOrigin } from "@app/lib/credits/agent_message_billing";
import {
  getEnabledModelsForAuth,
  resolveStreamModel,
} from "@app/lib/model_tiers/enabled_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import {
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
} from "@app/types/assistant/models/auto";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import type { ResolvedRequestedModel } from "@app/types/assistant/models/types";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

type PremiumModelFairUseDecision =
  | { action: "run_as_requested" }
  | {
      action: "downgrade";
      resolution: AgentMessageModelResolution;
      requested: ResolvedRequestedModel;
    }
  | { action: "refuse" };

// Resolves the Standard stream and refuses anything still priced premium: the stream's
// last-resort fallback is a preferred large model, which can be premium itself.
async function resolveDowngradeTarget(
  auth: Authenticator
): Promise<ResolvedRequestedModel | null> {
  const models = await getEnabledModelsForAuth(auth);
  const degradedModelIds = getDegradedModelIds();

  for (const streamId of [AUTO_MODEL_ID, AUTO_FAST_MODEL_ID] as const) {
    const { model, reasoningEffort } = resolveStreamModel(
      models,
      streamId,
      degradedModelIds
    );
    const tierName = getTierForModel(model.modelId, reasoningEffort);

    if (tierName && tierName !== "premium") {
      return {
        providerId: model.providerId,
        modelId: model.modelId,
        reasoningEffort,
      };
    }
  }

  return null;
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
  const tierName = getTierForModel(
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
  const isEnforced = featureFlags.includes(
    "enforce_premium_model_message_limit"
  );

  const downgradeTarget = isEnforced
    ? await resolveDowngradeTarget(auth)
    : null;

  logger.info(
    {
      workspaceId: workspace.sId,
      userId: user.sId,
      limit: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
      modelId: resolvedModel.modelId,
      reasoningEffort: resolvedModel.reasoningEffort,
      origin: context.origin,
      isEnforced,
      downgradedToModelId: downgradeTarget?.modelId ?? null,
    },
    "[PremiumModelLimit] Premium model weekly limit reached."
  );

  if (!isEnforced) {
    return { action: "run_as_requested" };
  }

  if (downgradeTarget) {
    return {
      action: "downgrade",
      requested: resolvedModel,
      resolution: {
        resolvedModel: downgradeTarget,
        modelResolutionMethod: "fair_use_downgrade",
      },
    };
  }

  return { action: "refuse" };
}

export async function enforcePremiumModelLimit(
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
): Promise<
  Result<AgentMessageModelResolution, APIErrorWithContentfulStatusCode>
> {
  const decision = await applyPremiumModelFairUse(auth, {
    user,
    resolution,
    context,
  });

  switch (decision.action) {
    case "run_as_requested":
      return new Ok(resolution);

    case "downgrade":
      return new Ok(decision.resolution);

    case "refuse":
      return new Err({
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message:
            `You have reached the limit of ${PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK} messages ` +
            `per week on premium models. Pick another model or try again later.`,
        },
      });

    default:
      assertNever(decision);
  }
}
