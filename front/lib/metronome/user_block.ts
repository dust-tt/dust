// Redis fast-path cache for credit-state-driven access control.
//
// Keys:
//   - `metronome:user_cap:<ws>:<user>`: caches the user's per-user cap state.
//   - `metronome:user_awu_warning:<ws>:<user>`: caches the 80% AWU warning state.
//   - `metronome:pool_depleted:<ws>`: caches the workspace pool state.
//
// Each key stores an explicit boolean flag: "1" (blocked/warned) or "0" (ok).
//
// `isUserBlocked` is the unified read: a user is blocked iff either cached flag
// is `"1"`, and it returns the reason ("credits_exhausted" for a depleted
// workspace pool, or "user_cap_reached" for a per-user cap) so callers can
// surface a tailored message. When both flags are set, `credits_exhausted`
// wins since the pool shadows the per-user state. The DB columns
// (`memberships.creditState`, `workspaces.poolCreditState`) remain the source
// of truth. Cache writes are gated on DB transaction commit via
// `invalidateCacheAfterCommit`, and cache misses fall back to DB and
// repopulate both flags.
//
// The AWU warning flag has no DB column backing it: a cold-cache miss returns
// `false` (safe default until the next webhook re-sets the flag).
//
// Programmatic cap state (depleted, credit status, warning flag) lives in
// front/lib/metronome/alerts/programmatic_cap.ts.
//
import { runOnRedis } from "@app/lib/api/redis";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import { isWorkspacePoolCreditState } from "@app/types/credits";

export type UserBlockedReason = "credits_exhausted" | "user_cap_reached";

const REDIS_ORIGIN = "metronome_limit" as const;
const BLOCKED_FLAG = "1";
const NOT_BLOCKED_FLAG = "0";

function buildUserCapKey(workspaceId: string, userId: string): string {
  return `metronome:user_cap:${workspaceId}:${userId}`;
}

function buildUserAwuWarningKey(workspaceId: string, userId: string): string {
  return `metronome:user_awu_warning:${workspaceId}:${userId}`;
}

function buildWorkspacePoolDepletedKey(workspaceId: string): string {
  return `metronome:pool_depleted:${workspaceId}`;
}

function buildWorkspaceCreditPoolStatusKey(workspaceId: string): string {
  return `metronome:pool_credit_status:${workspaceId}`;
}

function isBlockFlag(value: string | null): value is "0" | "1" {
  return value === BLOCKED_FLAG || value === NOT_BLOCKED_FLAG;
}

async function setFlag(key: string, value: string): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(key, value);
  });
}

async function getUserBlockedStateFromDb({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<{ userCapBlocked: boolean; workspacePoolDepleted: boolean }> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId, userId },
      "[MetronomeUserBlock] Workspace not found during cache read-through fallback"
    );
    return {
      userCapBlocked: false,
      workspacePoolDepleted: false,
    };
  }

  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId, userId },
      "[MetronomeUserBlock] User not found during cache read-through fallback"
    );
    return {
      userCapBlocked: false,
      workspacePoolDepleted: workspace.poolCreditState === "depleted",
    };
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
    });

  return {
    userCapBlocked: membership?.creditState === "capped",
    workspacePoolDepleted: workspace.poolCreditState === "depleted",
  };
}

async function syncCachedBlockedState({
  workspaceId,
  userId,
  userCapBlocked,
  workspacePoolDepleted,
}: {
  workspaceId: string;
  userId: string;
  userCapBlocked: boolean;
  workspacePoolDepleted: boolean;
}): Promise<void> {
  await Promise.all([
    setFlag(buildUserCapKey(workspaceId, userId), userCapBlocked ? "1" : "0"),
    setFlag(
      buildWorkspacePoolDepletedKey(workspaceId),
      workspacePoolDepleted ? "1" : "0"
    ),
  ]);
}

// Per-user cap (user credit state machine)

export async function setUserCapBlocked(
  workspaceId: string,
  userId: string
): Promise<void> {
  await setFlag(buildUserCapKey(workspaceId, userId), BLOCKED_FLAG);
}

export async function clearUserCapBlocked(
  workspaceId: string,
  userId: string
): Promise<void> {
  await setFlag(buildUserCapKey(workspaceId, userId), NOT_BLOCKED_FLAG);
}

// Per-user AWU 80% warning (set by webhook; no DB fallback)

export async function setUserAwuWarned(
  workspaceId: string,
  userId: string
): Promise<void> {
  await setFlag(buildUserAwuWarningKey(workspaceId, userId), BLOCKED_FLAG);
}

export async function clearUserAwuWarned(
  workspaceId: string,
  userId: string
): Promise<void> {
  await setFlag(buildUserAwuWarningKey(workspaceId, userId), NOT_BLOCKED_FLAG);
}

export async function isUserAwuWarned(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const val = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildUserAwuWarningKey(workspaceId, userId))
  );
  return val === BLOCKED_FLAG;
}

// Workspace pool depleted (workspace credit state machine)

export async function setWorkspacePoolDepleted(
  workspaceId: string
): Promise<void> {
  await setFlag(buildWorkspacePoolDepletedKey(workspaceId), BLOCKED_FLAG);
}

export async function clearWorkspacePoolDepleted(
  workspaceId: string
): Promise<void> {
  await setFlag(buildWorkspacePoolDepletedKey(workspaceId), NOT_BLOCKED_FLAG);
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
  const [userCap, poolDepleted] = await runOnRedis(
    { origin: REDIS_ORIGIN },
    async (client) =>
      Promise.all([
        client.get(buildUserCapKey(workspaceId, userId)),
        client.get(buildWorkspacePoolDepletedKey(workspaceId)),
      ])
  );

  if (isBlockFlag(userCap) && isBlockFlag(poolDepleted)) {
    return deriveBlockedReason({
      userCapBlocked: userCap === BLOCKED_FLAG,
      workspacePoolDepleted: poolDepleted === BLOCKED_FLAG,
    });
  }

  logger.info(
    {
      workspaceId,
      userId,
      userCapCacheHit: isBlockFlag(userCap),
      workspacePoolCacheHit: isBlockFlag(poolDepleted),
    },
    "[MetronomeUserBlock] Cache miss during user blocked check, falling back to DB"
  );

  const state = await getUserBlockedStateFromDb({ workspaceId, userId });
  await syncCachedBlockedState({
    workspaceId,
    userId,
    userCapBlocked: state.userCapBlocked,
    workspacePoolDepleted: state.workspacePoolDepleted,
  });

  return deriveBlockedReason(state);
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
export async function isApiBlocked(workspaceId: string): Promise<boolean> {
  const poolDepleted = await runOnRedis(
    { origin: REDIS_ORIGIN },
    async (client) => client.get(buildWorkspacePoolDepletedKey(workspaceId))
  );

  if (isBlockFlag(poolDepleted)) {
    return poolDepleted === BLOCKED_FLAG;
  }

  logger.info(
    {
      workspaceId,
      workspacePoolCacheHit: false,
    },
    "[MetronomeUserBlock] Cache miss during API blocked check, falling back to DB"
  );

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId },
      "[MetronomeUserBlock] Workspace not found during API blocked cache read-through fallback"
    );
    return false;
  }

  const workspacePoolDepleted = workspace.poolCreditState === "depleted";
  await setFlag(
    buildWorkspacePoolDepletedKey(workspaceId),
    workspacePoolDepleted ? "1" : "0"
  );

  return workspacePoolDepleted;
}
