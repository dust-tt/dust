import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import type { Authenticator } from "@app/lib/auth";
import { computeEffectiveMessageLimit } from "@app/lib/plans/usage/limits";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  expireRateLimiterKey,
  getRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
} from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export const MESSAGE_RATE_LIMIT_PER_ACTOR_PER_MINUTE = 100;
export const MESSAGE_RATE_LIMIT_WINDOW_SECONDS = 60;
export const MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR = 3_000;
export const MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR_WINDOW_SECONDS = 60 * 60;

// Sidekick messages are free (unbilled) usage, so they bypass the credit/plan
// caps. Cap them per actor to bound how much free usage a single user can
// generate through the builder assistant. Enterprise (and Dust internal)
// accounts get a higher allowance.
export const SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY = 100;
export const SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY_ENTERPRISE = 200;
export const SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY_WINDOW_SECONDS =
  24 * 60 * 60;

type MessageRateLimitActor =
  | {
      type: "api_key";
      id: number;
    }
  | {
      type: "user";
      id: number;
    };

export const makeMessageRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType
) => {
  return `postUserMessage:${owner.sId}`;
};

export const makeMessageRateLimitKeyForWorkspaceActor = (
  owner: LightWorkspaceType,
  actor: MessageRateLimitActor
) => {
  switch (actor.type) {
    case "api_key":
      return `workspace:${owner.sId}:api_key:${actor.id}:post_user_message`;
    case "user":
      return `workspace:${owner.sId}:user:${actor.id}:post_user_message`;
  }
};

export const makeMessageRateLimitKeyForWorkspaceActorPerHour = (
  owner: LightWorkspaceType,
  actor: MessageRateLimitActor
) => {
  return `${makeMessageRateLimitKeyForWorkspaceActor(owner, actor)}:hourly`;
};

export const makeSidekickMessageRateLimitKeyForWorkspaceActor = (
  owner: LightWorkspaceType,
  actor: MessageRateLimitActor
) => {
  return `${makeMessageRateLimitKeyForWorkspaceActor(owner, actor)}:sidekick_daily`;
};

export const makeAgentMentionsRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType,
  maxMessagesTimeframe: MaxMessagesTimeframeType
) => {
  return `workspace:${owner.id}:agent_message_count:${maxMessagesTimeframe}`;
};

export const makeFairUseAwuCreditsRateLimitKeyForUser = (
  owner: LightWorkspaceType,
  user: UserType,
  maxAwuCreditsTimeframe: MaxAwuCreditsTimeframeType
) => {
  return `workspace:${owner.id}:user:${user.id}:fair_use_awu_credit_count:${maxAwuCreditsTimeframe}`;
};

export const PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK = 25;
export const PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export const makePremiumModelMessageRateLimitKeyForUser = (
  workspace: LightWorkspaceType,
  user: UserType
) => {
  return `workspace:${workspace.id}:user:${user.id}:premium_model_message_count`;
};

// Fixed-window counter backing the admin-configured per-user spend cap. Always
// bucketed on the Metronome contract billing cycle (the fixed-window counter
// appends the cycle-boundary label). Distinct from the rolling plan-level
// fair-use key above.
export const makeSpendLimitAwuCreditsRateLimitKeyForUser = (
  owner: LightWorkspaceType,
  user: UserType
) => {
  return `workspace:${owner.id}:user:${user.id}:spend_limit_awu_microcredit_count`;
};

// Fixed-window bounds for the per-user spend cap over a Metronome contract
// billing cycle. Pure — both the recorder/enforcer (`spend_limit.ts`) and the
// poke read (`members_usage.ts`) derive the window from the same cycle so they
// hit the same Redis key. Labelled by the cycle start so each recurrence is a
// distinct key.
export const makeSpendLimitCycleWindowBounds = (
  cycleStart: Date,
  cycleEnd: Date
): FixedWindowBounds => {
  return {
    label: `cycle-${cycleStart.getTime()}`,
    windowEndMs: cycleEnd.getTime(),
  };
};

// Fixed-window counter backing the admin-configured per-API-key spend cap.
// Keyed by the key model id (the calling key is active, and key names are
// unique among active keys, so id and name are 1:1 here). Bucketed on the
// Metronome contract billing cycle via `makeSpendLimitCycleWindowBounds`, like
// the per-user key above.
export const makeApiKeySpendLimitAwuCreditsRateLimitKey = (keyId: number) => {
  return `api_key:${keyId}:spend_limit_awu_microcredit_count`;
};

// Fixed-window counter backing the workspace programmatic monthly spend cap
// (programmatic-only AWU usage). Workspace-scoped; bucketed on the Metronome
// contract billing cycle via `makeSpendLimitCycleWindowBounds`.
export const makeProgrammaticSpendLimitAwuCreditsRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType
) => {
  return `workspace:${owner.id}:programmatic_spend_limit_awu_microcredit_count`;
};

export const makeProgrammaticUsageRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType
) => {
  return `workspace:${owner.id}:programmatic_usage_rate_limit`;
};

export const makeKeyCapRateLimitKey = (keyId: number) => {
  return `api_key:${keyId}:cap_rate_limit`;
};

export async function resetMessageRateLimitForWorkspace(auth: Authenticator) {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  await expireRateLimiterKey({
    key: makeMessageRateLimitKeyForWorkspace(workspace),
  });

  await expireRateLimiterKey({
    key: makeAgentMentionsRateLimitKeyForWorkspace(
      workspace,
      plan.limits.assistant.maxMessagesTimeframe
    ),
  });
}

export async function resetFairUseAwuCreditsRateLimitForUser({
  auth,
  user,
}: {
  auth: Authenticator;
  user: UserType;
}) {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  const { maxAwuCredits, maxAwuCreditsTimeframe } = plan.limits.assistant;

  if (maxAwuCredits === -1) {
    return new Err(new Error("The workspace plan has no AWU fair-use limit."));
  }

  const resetResult = await expireRateLimiterKey({
    key: makeFairUseAwuCreditsRateLimitKeyForUser(
      workspace,
      user,
      maxAwuCreditsTimeframe
    ),
  });
  if (resetResult.isErr()) {
    return resetResult;
  }

  return new Ok({
    didResetExistingKey: resetResult.value,
    limit: maxAwuCredits,
    timeframe: maxAwuCreditsTimeframe,
  });
}

export async function getMessageUsageCount(auth: Authenticator): Promise<{
  count: number;
  limit: number;
}> {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  if (maxMessages === -1) {
    // Unlimited messages
    return { count: 0, limit: -1 };
  }

  const activeSeats = await countActiveSeatsForWorkspace(workspace.sId);
  const effectiveLimit = computeEffectiveMessageLimit({
    planCode: plan.code,
    maxMessages,
    activeSeats,
  });

  const result = await getRateLimiterCount({
    key: makeAgentMentionsRateLimitKeyForWorkspace(
      workspace,
      maxMessagesTimeframe
    ),
    timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
  });

  if (result.isErr()) {
    // Return 0 on error to avoid blocking the UI
    return { count: 0, limit: effectiveLimit };
  }

  // Cap count at limit to avoid displaying "120/100" if limit decreased.
  return {
    count: Math.min(result.value, effectiveLimit),
    limit: effectiveLimit,
  };
}
