// Redis fast-path cache for credit-state-driven access control.
//
// Four keys back the credit state machines:
//   - `metronome:user_credit_state:<ws>:<user>`: fine-grained user credit state
//     (mirrors `memberships.creditState`). Replaces the legacy boolean cap and
//     warning flags — "capped" means blocked, "*_low_balance" means warned.
//   - `metronome:pool_credit_status:<ws>`: fine-grained workspace pool state
//     (mirrors `workspaces.poolCreditState`).
//   - `metronome:pool_depleted:<ws>`: boolean shortcut for isUserBlocked /
//     isApiBlocked hot paths (still maintained alongside pool_credit_status).
//   - `metronome:programmatic_credit_status:<ws>` / `metronome:programmatic_depleted:<ws>`:
//     programmatic (API) cap state.
//
// `isUserBlocked` is the unified read: a user is blocked iff the pool is
// depleted or the user's credit state is "capped". It returns the reason
// ("credits_exhausted" / "user_cap_reached") so callers can surface a tailored
// message. When both conditions hold, "user_cap_reached" wins: the per-user cap
// is the user's actionable blocker, whereas refilling the pool would not unblock
// them. The DB columns remain the source of truth; cache writes are gated on
// DB transaction commit via `invalidateCacheAfterCommit`, and cache misses fall
// back to DB and repopulate the relevant keys.
//
import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import { runOnRedis } from "@app/lib/api/redis";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  getRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  WorkspacePoolCreditState,
  WorkspaceProgrammaticCreditState,
} from "@app/types/credits";
import {
  isWorkspacePoolCreditState,
  isWorkspaceProgrammaticCreditState,
} from "@app/types/credits";
import type { UserCreditState } from "@app/types/memberships";
import {
  isSpendingFromPersonalSeat,
  isUserCreditState,
} from "@app/types/memberships";
import type { MaxAwuCreditsTimeframeType, PlanType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export type UserBlockedReason =
  | "credits_exhausted"
  | "user_cap_reached"
  | "no_seat";

export type ProgrammaticCreditStatus = "active" | "warned" | "depleted";

export type FairUseAwuCreditsStatus = {
  limit: number;
  timeframe: MaxAwuCreditsTimeframeType;
  count: number;
};

const DEFAULT_FAIR_USE_AWU_CREDITS_STATUS: FairUseAwuCreditsStatus = {
  limit: -1,
  timeframe: "lifetime",
  count: 0,
};

export type GetWorkspaceUsageStatusResponseBody = {
  // True when the user has consumed ≥ 80 % of their credit allowance (soft warning, not yet blocked).
  userNearCreditLimit: boolean;
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditStatus: ProgrammaticCreditStatus;
  balanceThresholdReached: boolean;
  // Authoritative block reason from isUserBlocked — null means the user can
  // send messages. Replaces the old client-side derivations (noSeat,
  // awuStatus === "blocked", poolCreditState === "depleted").
  userBlockedReason: UserBlockedReason | null;
  canRequestUpgrade: boolean;
  hasPendingUpgradeRequest: boolean;
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

function buildWorkspaceProgrammaticCreditStatusKey(
  workspaceId: string
): string {
  return `metronome:programmatic_credit_status:${workspaceId}`;
}

function buildWorkspaceBalanceThresholdReachedKey(workspaceId: string): string {
  return `metronome:balance_threshold_warning:${workspaceId}`;
}

async function setFlag(key: string, value: string): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(key, value);
  });
}

// Per-user AWU 80% warning — derived from the fine-grained credit state.
// "*_low_balance" states mean the user is warned but not yet blocked.

export async function isUserAwuWarned(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const state = await getUserCreditState(workspaceId, userId);
  return state === "on_pool_low_balance" || state === "user_seat_low_balance";
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
    };
  }

  const result = await getRateLimiterCount({
    key: makeFairUseAwuCreditsRateLimitKeyForUser(workspace, user, timeframe),
    timeframeSeconds: getTimeframeSecondsFromLiteral(timeframe),
  });

  if (result.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        error: result.error,
      },
      "Failed to read fair-use AWU credits usage status."
    );

    return {
      limit,
      timeframe,
      count: 0,
    };
  }

  return {
    limit,
    timeframe,
    count: Math.min(result.value, limit),
  };
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

export async function isUserBlocked(
  workspace: LightWorkspaceType,
  user: UserResource
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

  const [creditStateRaw, poolStatusRaw] = await runOnRedis(
    { origin: REDIS_ORIGIN },
    async (client) =>
      Promise.all([
        client.get(buildUserCreditStateKey(workspaceId, userId)),
        client.get(buildWorkspaceCreditPoolStatusKey(workspaceId)),
      ])
  );

  // Both getters have their own DB fallback and cache repopulation.
  const userCreditState =
    creditStateRaw && isUserCreditState(creditStateRaw)
      ? creditStateRaw
      : await getUserCreditState(workspaceId, userId);

  const poolStatus =
    poolStatusRaw && isWorkspacePoolCreditState(poolStatusRaw)
      ? poolStatusRaw
      : await getWorkspaceCreditPoolStatus(workspaceId);

  let workspacePoolDepleted = poolStatus === "depleted";

  // A user spending from their personal seat balance (`user_seat` /
  // `user_seat_low_balance`) still has their own credits, so workspace pool
  // depletion must not block them — only their per-user cap can.
  if (workspacePoolDepleted && isSpendingFromPersonalSeat(userCreditState)) {
    workspacePoolDepleted = false;
  }

  return deriveBlockedReason({
    userCapBlocked: userCreditState === "capped",
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

export async function getUserCreditState(
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

  const state: UserCreditState =
    membership && isUserCreditState(membership.creditState)
      ? membership.creditState
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

// Workspace programmatic credit state (monthly cap).

export async function setWorkspaceProgrammaticCreditStatus(
  workspaceId: string,
  status: WorkspaceProgrammaticCreditState
): Promise<void> {
  await setFlag(buildWorkspaceProgrammaticCreditStatusKey(workspaceId), status);
}

export async function getWorkspaceProgrammaticCreditStatus(
  workspaceId: string
): Promise<WorkspaceProgrammaticCreditState> {
  const cached = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildWorkspaceProgrammaticCreditStatusKey(workspaceId))
  );

  if (cached && isWorkspaceProgrammaticCreditState(cached)) {
    return cached;
  }

  logger.info(
    {
      workspaceId,
      workspaceProgrammaticCreditStatusCacheHit: false,
    },
    "[MetronomeUserBlock] Cache miss during programmatic credit status check, falling back to DB"
  );

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId },
      "[MetronomeUserBlock] Workspace not found during programmatic credit status cache read-through fallback"
    );
    return "active";
  }

  const status = workspace.programmaticCreditState;
  await setFlag(buildWorkspaceProgrammaticCreditStatusKey(workspaceId), status);
  return status;
}

export async function isProgrammaticApiBlocked(
  workspaceId: string
): Promise<boolean> {
  // getWorkspaceProgrammaticCreditStatus has its own DB fallback and cache repopulation.
  const status = await getWorkspaceProgrammaticCreditStatus(workspaceId);
  return status === "depleted";
}

// Workspace-pool-only read for API calls (no per-user cap).
export async function isApiBlocked(workspaceId: string): Promise<boolean> {
  // getWorkspaceCreditPoolStatus has its own DB fallback and cache repopulation.
  const poolStatus = await getWorkspaceCreditPoolStatus(workspaceId);
  return poolStatus === "depleted";
}
