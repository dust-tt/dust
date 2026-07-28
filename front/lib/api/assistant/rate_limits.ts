import type { Authenticator } from "@app/lib/auth";
import { computeEffectiveMessageLimit } from "@app/lib/plans/usage/limits";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import {
  addFixedWindowCount,
  addRateLimiterCount,
  computeCalendarWindowBounds,
  expireRateLimiterKey,
  getFixedWindowCount,
  getRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
} from "@app/types/plan";
import { isRollingAwuCreditsTimeframeType } from "@app/types/rate_limiter";
import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export const MESSAGE_RATE_LIMIT_PER_ACTOR_PER_MINUTE = 100;
export const MESSAGE_RATE_LIMIT_WINDOW_SECONDS = 60;
export const MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR = 3_000;
export const MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR_WINDOW_SECONDS = 60 * 60;

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

export const makeProgrammaticUsageRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType
) => {
  return `workspace:${owner.id}:programmatic_usage_rate_limit`;
};

export const makeKeyCapRateLimitKey = (keyId: number) => {
  return `api_key:${keyId}:cap_rate_limit`;
};

// Read the current fair-use AWU count for `key`, dispatching to the rolling
// limiter for rolling timeframes and the fixed-window counter (calendar) for
// fixed ones.
export async function getFairUseAwuCreditsCount({
  key,
  timeframe,
}: {
  key: string;
  timeframe: MaxAwuCreditsTimeframeType;
}): Promise<Result<number, Error>> {
  if (isRollingAwuCreditsTimeframeType(timeframe)) {
    return getRateLimiterCount({
      key,
      timeframeSeconds: getTimeframeSecondsFromLiteral(timeframe),
    });
  }
  return getFixedWindowCount({
    key,
    bounds: computeCalendarWindowBounds(timeframe, new Date()),
  });
}

// Record `incrementBy` against the fair-use AWU counter for `key`, dispatching
// on the timeframe the same way as `getFairUseAwuCreditsCount`.
export async function recordFairUseAwuCredits({
  key,
  timeframe,
  incrementBy,
  logger,
}: {
  key: string;
  timeframe: MaxAwuCreditsTimeframeType;
  incrementBy: number;
  logger: LoggerInterface;
}): Promise<void> {
  if (isRollingAwuCreditsTimeframeType(timeframe)) {
    await addRateLimiterCount({
      key,
      timeframeSeconds: getTimeframeSecondsFromLiteral(timeframe),
      incrementBy,
      logger,
    });
    return;
  }
  await addFixedWindowCount({
    key,
    bounds: computeCalendarWindowBounds(timeframe, new Date()),
    incrementBy,
    logger,
  });
}

// Expire the current fair-use AWU window for `key`. Fixed (calendar) windows
// carry the window-boundary label suffix on the live Redis key, so expire that
// rather than the base key.
async function expireFairUseAwuCreditsWindow({
  key,
  timeframe,
}: {
  key: string;
  timeframe: MaxAwuCreditsTimeframeType;
}): Promise<Result<boolean, Error>> {
  if (isRollingAwuCreditsTimeframeType(timeframe)) {
    return expireRateLimiterKey({ key });
  }
  const bounds = computeCalendarWindowBounds(timeframe, new Date());
  return expireRateLimiterKey({ key: `${key}:${bounds.label}` });
}

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

  const resetResult = await expireFairUseAwuCreditsWindow({
    key: makeFairUseAwuCreditsRateLimitKeyForUser(
      workspace,
      user,
      maxAwuCreditsTimeframe
    ),
    timeframe: maxAwuCreditsTimeframe,
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

  const activeSeats = await MembershipResource.countActiveSeatsInWorkspace(
    workspace.sId
  );
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
