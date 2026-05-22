// Redis fast-path cache for credit-state-driven access control.
//
// Two orthogonal keys back the credit state machines:
//   - `metronome:user_cap:<ws>:<user>`: caches the user's per-user cap state.
//   - `metronome:pool_depleted:<ws>`: caches the workspace pool state.
//
// Each key stores an explicit boolean flag:
//   - `"1"`: blocked / depleted
//   - `"0"`: not blocked / not depleted
//
// `isUserBlocked` is the unified read: a user is blocked iff either cached flag
// is `"1"`. The DB columns (`memberships.creditState`,
// `workspaces.poolCreditState`) remain the source of truth. Cache writes are
// gated on DB transaction commit via `invalidateCacheAfterCommit`, and cache
// misses fall back to DB and repopulate both flags.
//
import { runOnRedis } from "@app/lib/api/redis";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

const REDIS_ORIGIN = "metronome_limit" as const;
const BLOCKED_FLAG = "1";
const NOT_BLOCKED_FLAG = "0";

function buildUserCapKey(workspaceId: string, userId: string): string {
  return `metronome:user_cap:${workspaceId}:${userId}`;
}

function buildWorkspacePoolDepletedKey(workspaceId: string): string {
  return `metronome:pool_depleted:${workspaceId}`;
}

function isBlockFlag(value: string | null): value is "0" | "1" {
  return value === BLOCKED_FLAG || value === NOT_BLOCKED_FLAG;
}

async function setFlag(key: string, value: "0" | "1"): Promise<void> {
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

export async function isUserBlocked(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const [userCap, poolDepleted] = await runOnRedis(
    { origin: REDIS_ORIGIN },
    async (client) =>
      Promise.all([
        client.get(buildUserCapKey(workspaceId, userId)),
        client.get(buildWorkspacePoolDepletedKey(workspaceId)),
      ])
  );

  if (isBlockFlag(userCap) && isBlockFlag(poolDepleted)) {
    return userCap === BLOCKED_FLAG && poolDepleted === BLOCKED_FLAG;
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

  return state.userCapBlocked || state.workspacePoolDepleted;
}
