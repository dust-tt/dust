// Redis fast-path cache for credit-state-driven access control.
//
// This is the Metronome-credit-state layer. Access-control callers go through
// `lib/api/credits/access_control.ts`, which enforces spend caps from the Redis
// rate-limiter counters; the pool/no_seat/personal-seat logic here still backs
// `isUserBlockedByMetronome` (the caller passes the rate-limiter per-user cap
// verdict in) and `isApiBlockedByMetronome`.
//
// Keys back the credit state machines:
//   - `metronome:user_credit_state:<ws>:<user>`: user seat↔pool credit state
//     (mirrors `memberships.creditState`: `user_seat` / `on_pool`).
//   - `metronome:pool_credit_status:<ws>`: fine-grained workspace pool state
//     (mirrors `workspaces.poolCreditState`).
//   - `metronome:pool_depleted:<ws>`: boolean shortcut for
//     isUserBlockedByMetronome / isApiBlockedByMetronome hot paths (still
//     maintained alongside pool_credit_status).
//   - `metronome:programmatic_credit_status:<ws>` / `metronome:programmatic_depleted:<ws>`:
//     programmatic (API) cap state.
//
// `isUserBlockedByMetronome` is the unified read: a user is blocked iff the pool
// is depleted or the caller-supplied per-user cap verdict is set. It returns the
// reason
// ("credits_exhausted" / "user_cap_reached") so callers can surface a tailored
// message. When both conditions hold, "user_cap_reached" wins: the per-user cap
// is the user's actionable blocker, whereas refilling the pool would not unblock
// them. The DB columns remain the source of truth; cache writes are gated on
// DB transaction commit via `invalidateCacheAfterCommit`, and cache misses fall
// back to DB and repopulate the relevant keys.
//
import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import { runOnRedis } from "@app/lib/api/redis";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WeightedRateLimiterEntry } from "@app/lib/utils/rate_limiter";
import {
  getTimeframeSecondsFromLiteral,
  getWeightedRateLimiterEntries,
  getWeightedRateLimiterUsage,
  getWeightedRateLimiterUsageForKeys,
} from "@app/lib/utils/rate_limiter";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import { isWorkspacePoolCreditState } from "@app/types/credits";
import type { UserCreditState } from "@app/types/memberships";
import {
  isSpendingFromPersonalSeat,
  isUserCreditState,
  normalizeUserCreditState,
} from "@app/types/memberships";
import type { MaxAwuCreditsTimeframeType, PlanType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export type UserBlockedReason =
  | "credits_exhausted"
  | "user_cap_reached"
  | "no_seat";

export type ProgrammaticCreditStatus = "active" | "depleted";

export type FairUseAwuCreditsStatus = {
  limit: number;
  timeframe: MaxAwuCreditsTimeframeType;
  count: number;
  nextResetAt?: string | null;
  // Optional for compatibility with clients deployed before the refill schedule was added.
  refillSchedule?: { date: string; credits: number }[];
};

const DEFAULT_FAIR_USE_AWU_CREDITS_STATUS: FairUseAwuCreditsStatus = {
  limit: -1,
  timeframe: "lifetime",
  count: 0,
  nextResetAt: null,
};

export type GetWorkspaceUsageStatusResponseBody = {
  // True when the user has consumed ≥ 80 % of their credit allowance (soft warning, not yet blocked).
  userNearCreditLimit: boolean;
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditStatus: ProgrammaticCreditStatus;
  // True when workspace programmatic usage has crossed WARNING_BALANCE_RATIO of the monthly cap.
  // Redis-only flag, independent of the throttling states (active_low_balance etc.).
  programmaticWarningReached: boolean;
  balanceThresholdReached: boolean;
  // Authoritative block reason from access_control's isUserBlocked — null means the user can
  // send messages. Replaces the old client-side derivations (noSeat,
  // awuStatus === "blocked", poolCreditState === "depleted").
  userBlockedReason: UserBlockedReason | null;
  canRequestUpgrade: boolean;
  hasPendingUpgradeRequest: boolean;
  willAutoUpgrade: boolean;
  requireReason: boolean;
};

export type GetFairUseCreditsResponseBody = {
  fairUseAwuCreditsState: FairUseAwuCreditsStatus;
};

const REDIS_ORIGIN = "metronome_limit" as const;

function buildWorkspaceCreditPoolStatusKey(workspaceId: string): string {
  return `metronome:pool_credit_status:${workspaceId}`;
}

function buildUserCreditStateKey(workspaceId: string, userId: string): string {
  return `metronome:user_credit_state:${workspaceId}:${userId}`;
}

function buildWorkspaceBalanceThresholdReachedKey(workspaceId: string): string {
  return `metronome:balance_threshold_warning:${workspaceId}`;
}

async function setFlag(key: string, value: string): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(key, value);
  });
}

// Workspace credit-balance threshold reached (admin-configured early warning).
// Unlike the other warnings this cannot be derived from a credit state: the
// threshold is an arbitrary amount the admin picks, not a system pool state, so
// it gets its own flag — set by the webhook when the workspace's own
// balance-threshold alert fires and cleared when the balance recovers. No DB
// fallback: a cold-cache miss reads as "not reached" until the next webhook.

export async function setWorkspaceBalanceThresholdReached(
  workspaceId: string
): Promise<void> {
  await setFlag(buildWorkspaceBalanceThresholdReachedKey(workspaceId), "1");
}

export async function clearWorkspaceBalanceThresholdReached(
  workspaceId: string
): Promise<void> {
  await setFlag(buildWorkspaceBalanceThresholdReachedKey(workspaceId), "0");
}

export async function isWorkspaceBalanceThresholdReached(
  workspaceId: string
): Promise<boolean> {
  const val = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildWorkspaceBalanceThresholdReachedKey(workspaceId))
  );
  return val === "1";
}

function getFairUseCreditsRefillSchedule({
  entries,
  windowMs,
}: {
  entries: WeightedRateLimiterEntry[];
  windowMs: number;
}): { date: string; credits: number }[] {
  const creditsByRefillDay = new Map<string, number>();
  for (const { timestampMs, microCredits } of entries) {
    const date = new Date(timestampMs + windowMs).toISOString().slice(0, 10);
    creditsByRefillDay.set(
      date,
      (creditsByRefillDay.get(date) ?? 0) + microCreditsToCredits(microCredits)
    );
  }

  return Array.from(creditsByRefillDay.entries())
    .map(([date, credits]) => ({ date, credits }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getFairUseAwuCreditsStatus({
  workspace,
  user,
  plan,
}: {
  workspace: LightWorkspaceType;
  user: UserType;
  plan: PlanType | null;
}): Promise<FairUseAwuCreditsStatus> {
  if (!plan) {
    return DEFAULT_FAIR_USE_AWU_CREDITS_STATUS;
  }

  const { maxAwuCredits: limit, maxAwuCreditsTimeframe: timeframe } =
    plan.limits.assistant;

  if (limit === -1) {
    return {
      limit,
      timeframe,
      count: 0,
      nextResetAt: null,
    };
  }

  const timeframeSeconds = getTimeframeSecondsFromLiteral(timeframe);
  const key = makeFairUseAwuCreditsRateLimitKeyForUser(
    workspace,
    user,
    timeframe
  );
  const [usageResult, entriesResult] = await Promise.all([
    getWeightedRateLimiterUsage({ key, timeframeSeconds }),
    getWeightedRateLimiterEntries({ key, timeframeSeconds }),
  ]);

  if (usageResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        error: usageResult.error,
      },
      "Failed to read fair-use AWU credits usage status."
    );

    return {
      limit,
      timeframe,
      count: 0,
      nextResetAt: null,
    };
  }

  if (entriesResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        error: entriesResult.error,
      },
      "Failed to read fair-use AWU credits refill schedule."
    );
  }

  const windowMs = timeframeSeconds * 1000;

  // The counter stores microCredits; the status stays credit-denominated (with
  // decimals), so convert before capping against the credit limit.
  return {
    limit,
    timeframe,
    count: Math.min(microCreditsToCredits(usageResult.value.count), limit),
    nextResetAt:
      usageResult.value.oldestTimestampMs === null
        ? null
        : new Date(
            usageResult.value.oldestTimestampMs + windowMs
          ).toISOString(),
    refillSchedule: entriesResult.isOk()
      ? getFairUseCreditsRefillSchedule({
          entries: entriesResult.value,
          windowMs,
        })
      : [],
  };
}

// Bulk variant of `getFairUseAwuCreditsStatus`
export async function getFairUseAwuCreditsUsedCountsByUser({
  workspace,
  users,
  plan,
}: {
  workspace: LightWorkspaceType;
  users: UserType[];
  plan: PlanType | null;
}): Promise<Map<string, number>> {
  if (!plan || plan.limits.assistant.maxAwuCredits === -1) {
    return new Map();
  }

  const { maxAwuCredits: limit, maxAwuCreditsTimeframe: timeframe } =
    plan.limits.assistant;
  const timeframeSeconds = getTimeframeSecondsFromLiteral(timeframe);

  const keyByUserId = new Map(
    users.map((user) => [
      user.sId,
      makeFairUseAwuCreditsRateLimitKeyForUser(workspace, user, timeframe),
    ])
  );

  const result = await getWeightedRateLimiterUsageForKeys({
    keys: Array.from(keyByUserId.values()),
    timeframeSeconds,
  });
  const usageByKey = result.isOk() ? result.value : new Map();

  return new Map(
    Array.from(keyByUserId, ([sId, key]) => [
      sId,
      Math.min(microCreditsToCredits(usageByKey.get(key)?.count ?? 0), limit),
    ])
  );
}

// Unified read

function deriveBlockedReason({
  userCapBlocked,
  workspacePoolDepleted,
}: {
  userCapBlocked: boolean;
  workspacePoolDepleted: boolean;
}): UserBlockedReason | null {
  // The per-user cap takes precedence over pool depletion: when a user has hit
  // their own cap, that is their actionable blocker. Refilling the workspace
  // pool would not unblock them, so surfacing "workspace out of credits" would
  // be misleading. The pool reason is only relevant when the user is not capped.
  if (userCapBlocked) {
    return "user_cap_reached";
  }
  if (workspacePoolDepleted) {
    return "credits_exhausted";
  }
  return null;
}

export async function isUserBlockedByMetronome(
  workspace: LightWorkspaceType,
  user: UserResource,
  // Whether the user has hit their per-user spend cap, resolved from the Redis
  // rate-limiter counter by the wrapper in
  // `lib/api/credits/access_control.ts`. The pool/seat logic (no_seat, pool
  // depletion, personal-seat carve-out) stays defined here so it lives in one
  // place.
  { userCapBlocked }: { userCapBlocked: boolean }
): Promise<UserBlockedReason | null> {
  const workspaceId = workspace.sId;
  const userId = user.sId;

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (membership?.seatType === "none") {
    return "no_seat";
  }

  const poolStatusRaw = await runOnRedis(
    { origin: REDIS_ORIGIN },
    async (client) => client.get(buildWorkspaceCreditPoolStatusKey(workspaceId))
  );

  // The credit-state getter has its own DB fallback and cache repopulation.
  const userCreditState = await getUserCreditState(workspaceId, userId);

  const poolStatus =
    poolStatusRaw && isWorkspacePoolCreditState(poolStatusRaw)
      ? poolStatusRaw
      : await getWorkspaceCreditPoolStatus(workspaceId);

  let workspacePoolDepleted = poolStatus === "depleted";

  // A user spending from their personal seat balance (`user_seat`) still has
  // their own credits, so workspace pool depletion must not block them — only
  // their per-user cap can.
  if (workspacePoolDepleted && isSpendingFromPersonalSeat(userCreditState)) {
    workspacePoolDepleted = false;
  }

  return deriveBlockedReason({
    userCapBlocked,
    workspacePoolDepleted,
  });
}

// Per-user credit state (fine-grained state mirroring memberships.creditState).

export async function setUserCreditState(
  workspaceId: string,
  userId: string,
  state: UserCreditState
): Promise<void> {
  await setFlag(buildUserCreditStateKey(workspaceId, userId), state);
}

async function getUserCreditState(
  workspaceId: string,
  userId: string
): Promise<UserCreditState> {
  const cached = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildUserCreditStateKey(workspaceId, userId))
  );

  if (cached && isUserCreditState(cached)) {
    return cached;
  }

  logger.info(
    { workspaceId, userId, userCreditStateCacheHit: false },
    "[MetronomeUserBlock] Cache miss during user credit state check, falling back to DB"
  );

  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId, userId },
      "[MetronomeUserBlock] User not found during user credit state cache read-through fallback"
    );
    return "on_pool";
  }

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId, userId },
      "[MetronomeUserBlock] Workspace not found during user credit state cache read-through fallback"
    );
    return "on_pool";
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
    });

  // Normalize so legacy rows (pre-narrowing `*_low_balance` / `capped` / `normal`
  // values) map onto the canonical `user_seat` / `on_pool` set until the backfill
  // migration lands.
  const state: UserCreditState = membership
    ? normalizeUserCreditState(membership.creditState)
    : "on_pool";

  await setFlag(buildUserCreditStateKey(workspaceId, userId), state);
  return state;
}

// Workspace credit pool status (fine-grained state for UI/notifications).

export async function setWorkspaceCreditPoolStatus(
  workspaceId: string,
  status: WorkspacePoolCreditState
): Promise<void> {
  await setFlag(buildWorkspaceCreditPoolStatusKey(workspaceId), status);
}

export async function getWorkspaceCreditPoolStatus(
  workspaceId: string
): Promise<WorkspacePoolCreditState> {
  const cached = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildWorkspaceCreditPoolStatusKey(workspaceId))
  );

  if (cached && isWorkspacePoolCreditState(cached)) {
    return cached;
  }

  logger.info(
    {
      workspaceId,
      workspaceCreditPoolStatusCacheHit: false,
    },
    "[MetronomeUserBlock] Cache miss during credit pool status check, falling back to DB"
  );

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId },
      "[MetronomeUserBlock] Workspace not found during credit pool status cache read-through fallback"
    );
    return "active";
  }

  const status = workspace.poolCreditState;
  await setFlag(buildWorkspaceCreditPoolStatusKey(workspaceId), status);
  return status;
}

// Workspace-pool-only read for API calls (no per-user cap).
export async function isApiBlockedByMetronome(
  workspaceId: string
): Promise<boolean> {
  // getWorkspaceCreditPoolStatus has its own DB fallback and cache repopulation.
  const poolStatus = await getWorkspaceCreditPoolStatus(workspaceId);
  return poolStatus === "depleted";
}
