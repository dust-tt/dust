import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import type { Authenticator } from "@app/lib/auth";
import { computeEffectiveMessageLimit } from "@app/lib/plans/usage/limits";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  expireRateLimiterKey,
  getRateLimiterCount,
  getRateLimiterCounts,
  getRateLimiterTimestamps,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
} from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
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
  // `:v2_microcredits` marks the switch to weighted amount-carrying entries
  // (`<microCredits>:<uuid>`, summed on read). Bumping the key prevents summing
  // the new entries together with legacy plain-uuid rows; the short rolling
  // window makes the pre-existing key expire quickly after cutover.
  return `workspace:${owner.id}:user:${user.id}:fair_use_awu_credit_count:${maxAwuCreditsTimeframe}:v2_microcredits`;
};

export const PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK = 25;
export const PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export const makePremiumModelMessageRateLimitKeyForUser = (
  workspace: Pick<LightWorkspaceType, "id">,
  user: Pick<UserType, "id">
) => {
  return `workspace:${workspace.id}:user:${user.id}:premium_model_message_count`;
};

export type PremiumModelMessageUsage = {
  usedMessages: number;
  remainingMessages: number;
  limitMessages: number;
  windowDays: number;
  // Optional for compatibility with clients deployed before refill information was added.
  nextRefill?: { availableAt: string; messages: number } | null;
  // Optional for compatibility with clients deployed before the daily breakdown was added.
  dailyUsage?: { date: string; usedMessages: number }[];
  refillSchedule?: { date: string; messages: number }[];
};

function getNextPremiumModelRefill({
  timestampsMs,
  windowMs,
}: {
  timestampsMs: number[];
  windowMs: number;
}): PremiumModelMessageUsage["nextRefill"] {
  if (
    timestampsMs.length < PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK
  ) {
    return null;
  }

  const oldestTimestampMs = timestampsMs[0];
  const messages = timestampsMs.filter(
    (timestampMs) => timestampMs === oldestTimestampMs
  ).length;

  return {
    availableAt: new Date(oldestTimestampMs + windowMs).toISOString(),
    messages,
  };
}

function getPremiumModelRefillSchedule({
  timestampsMs,
  windowMs,
}: {
  timestampsMs: number[];
  windowMs: number;
}): { date: string; messages: number }[] {
  const messagesByRefillDay = new Map<string, number>();
  for (const timestampMs of timestampsMs) {
    const date = new Date(timestampMs + windowMs).toISOString().slice(0, 10);
    messagesByRefillDay.set(date, (messagesByRefillDay.get(date) ?? 0) + 1);
  }

  return Array.from(messagesByRefillDay.entries())
    .map(([date, messages]) => ({ date, messages }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getUtcDayStartMs(timestampMs: number): number {
  const date = new Date(timestampMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getPremiumModelDailyUsage({
  timestampsMs,
  windowStartMs,
  windowEndMs,
}: {
  timestampsMs: number[];
  windowStartMs: number;
  windowEndMs: number;
}): { date: string; usedMessages: number }[] {
  const usageByDay = new Map<string, number>();
  for (const timestampMs of timestampsMs) {
    const date = new Date(timestampMs).toISOString().slice(0, 10);
    usageByDay.set(date, (usageByDay.get(date) ?? 0) + 1);
  }

  const dailyUsage: { date: string; usedMessages: number }[] = [];
  const firstDayStartMs = getUtcDayStartMs(windowStartMs);
  const lastDayStartMs = getUtcDayStartMs(windowEndMs);
  for (
    let dayStartMs = firstDayStartMs;
    dayStartMs <= lastDayStartMs;
    dayStartMs += ONE_DAY_MS
  ) {
    const date = new Date(dayStartMs).toISOString().slice(0, 10);
    dailyUsage.push({ date, usedMessages: usageByDay.get(date) ?? 0 });
  }

  return dailyUsage;
}

export async function getPremiumModelMessageUsage({
  workspace,
  user,
}: {
  workspace: Pick<LightWorkspaceType, "id">;
  user: Pick<UserType, "id">;
}): Promise<PremiumModelMessageUsage> {
  const result = await getRateLimiterTimestamps({
    key: makePremiumModelMessageRateLimitKeyForUser(workspace, user),
    timeframeSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
  });
  const timestampsMs = result.isOk()
    ? result.value.slice(-PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK)
    : [];
  const usedMessages = timestampsMs.length;
  const windowEndMs = Date.now();
  const windowMs = PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS * 1000;
  const windowStartMs = windowEndMs - windowMs;

  return {
    usedMessages,
    remainingMessages:
      PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK - usedMessages,
    limitMessages: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_PER_USER_PER_WEEK,
    windowDays:
      PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS / (24 * 60 * 60),
    nextRefill: getNextPremiumModelRefill({ timestampsMs, windowMs }),
    dailyUsage: getPremiumModelDailyUsage({
      timestampsMs,
      windowStartMs,
      windowEndMs,
    }),
    refillSchedule: getPremiumModelRefillSchedule({ timestampsMs, windowMs }),
  };
}

export async function getPremiumModelMessageUsedCountsByUser({
  workspace,
  users,
}: {
  workspace: Pick<LightWorkspaceType, "id">;
  users: Pick<UserType, "id" | "sId">[];
}): Promise<Map<string, number>> {
  const keyByUserId = new Map(
    users.map((user) => [
      user.sId,
      makePremiumModelMessageRateLimitKeyForUser(workspace, user),
    ])
  );

  const result = await getRateLimiterCounts({
    keys: Array.from(keyByUserId.values()),
    timeframeSeconds: PREMIUM_MODEL_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
  });
  const countByKey = result.isOk() ? result.value : new Map<string, number>();

  return new Map(
    Array.from(keyByUserId, ([sId, key]) => [sId, countByKey.get(key) ?? 0])
  );
}

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

// Fixed-window counter backing the free-seat *lifetime* spend allowance.
// Distinct base key from the per-cycle spend-cap key above: free seats carry a
// lifetime credit balance (not a per-cycle cap), so their counter never rolls
// over. Paired with `makeSpendLimitLifetimeWindowBounds` (a stable, non-cycle
// label), it is a single per-user key that accumulates for the seat's lifetime.
export const makeFreeSeatLifetimeAwuCreditsRateLimitKeyForUser = (
  owner: LightWorkspaceType,
  user: UserType
) => {
  return `workspace:${owner.id}:user:${user.id}:free_seat_lifetime_awu_microcredit_count`;
};

// Never-rolling fixed-window bounds for the free-seat lifetime counter. The
// label is stable (not cycle-derived) so the counter is a single lasting key,
// and `windowEndMs` is far in the future so it never expires under the
// PEXPIREAT grace. Mirror of `makeSpendLimitCycleWindowBounds` for the lifetime
// dimension.
const FREE_SEAT_LIFETIME_WINDOW_END_MS = Date.UTC(2100, 0, 1);
export const makeSpendLimitLifetimeWindowBounds = (): FixedWindowBounds => {
  return {
    label: "lifetime",
    windowEndMs: FREE_SEAT_LIFETIME_WINDOW_END_MS,
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
