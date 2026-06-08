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
// message. The DB columns remain the source of truth; cache writes are gated on
// DB transaction commit via `invalidateCacheAfterCommit`, and cache misses fall
// back to DB and repopulate the relevant keys.
//
import { runOnRedis } from "@app/lib/api/redis";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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

export type UserBlockedReason = "credits_exhausted" | "user_cap_reached";

export type ProgrammaticCreditStatus = "active" | "warned" | "depleted";

export type GetWorkspaceUsageStatusResponseBody = {
  awuStatus: "normal" | "warned" | "blocked";
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditStatus: ProgrammaticCreditStatus;
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

// Unified read

function deriveBlockedReason({
  userCapBlocked,
  workspacePoolDepleted,
}: {
  userCapBlocked: boolean;
  workspacePoolDepleted: boolean;
}): UserBlockedReason | null {
  if (workspacePoolDepleted) {
    return "credits_exhausted";
  }
  if (userCapBlocked) {
    return "user_cap_reached";
  }
  return null;
}

export async function isUserBlocked(
  workspaceId: string,
  userId: string
): Promise<UserBlockedReason | null> {
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
