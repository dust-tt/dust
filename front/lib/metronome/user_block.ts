// Redis fast-path cache for credit-state-driven access control.
//
// Per-user credit state is cached as the raw `UserCreditState` string under
// `metronome:user_credit_status:<ws>:<user>`, mirroring the
// `memberships.creditState` column. The workspace pool state is a separate
// boolean flag under `metronome:pool_depleted:<ws>`.
//
//   - `isUserBlocked` derives the block reason: "credits_exhausted" when the
//     workspace pool is depleted (this shadows the per-user state), else
//     "user_cap_reached" when the user's state is `capped`.
//   - `isUserAwuWarned` derives the 80% warning from the `*_low_balance` states.
//
// The DB columns (`memberships.creditState`, `workspaces.poolCreditState`)
// remain the source of truth; cache misses fall back to them and repopulate.
// State-machine writes are gated on DB transaction commit via
// `invalidateCacheAfterCommit`.
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
import { isUserCreditState } from "@app/types/memberships";

export type UserBlockedReason = "credits_exhausted" | "user_cap_reached";

const REDIS_ORIGIN = "metronome_limit" as const;
const BLOCKED_FLAG = "1";
const NOT_BLOCKED_FLAG = "0";

function buildWorkspacePoolDepletedKey(workspaceId: string): string {
  return `metronome:pool_depleted:${workspaceId}`;
}

function buildUserCreditStatusKey(workspaceId: string, userId: string): string {
  return `metronome:user_credit_status:${workspaceId}:${userId}`;
}

function buildWorkspaceCreditPoolStatusKey(workspaceId: string): string {
  return `metronome:pool_credit_status:${workspaceId}`;
}

function buildWorkspaceProgrammaticDepletedKey(workspaceId: string): string {
  return `metronome:programmatic_depleted:${workspaceId}`;
}

function buildWorkspaceProgrammaticCreditStatusKey(
  workspaceId: string
): string {
  return `metronome:programmatic_credit_status:${workspaceId}`;
}

function isBlockFlag(value: string | null): value is "0" | "1" {
  return value === BLOCKED_FLAG || value === NOT_BLOCKED_FLAG;
}

async function setFlag(key: string, value: string): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(key, value);
  });
}

// Source-of-truth read: the user's `creditState` column (default `on_pool`
// when the workspace, user, or active membership can't be resolved).
async function fetchUserCreditStateFromDb({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<UserCreditState> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId, userId },
      "[MetronomeUserBlock] Workspace not found during credit-status read-through fallback"
    );
    return "on_pool";
  }

  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId, userId },
      "[MetronomeUserBlock] User not found during credit-status read-through fallback"
    );
    return "on_pool";
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
    });

  return membership?.creditState ?? "on_pool";
}

// Per-user credit state (mirrors `memberships.creditState`).

function isLowBalanceState(state: UserCreditState): boolean {
  return state === "user_seat_low_balance" || state === "on_pool_low_balance";
}

export async function setUserCreditStatus(
  workspaceId: string,
  userId: string,
  state: UserCreditState
): Promise<void> {
  await setFlag(buildUserCreditStatusKey(workspaceId, userId), state);
}

// Drop the cached entry so the next read re-derives from the DB. Used when the
// membership is gone (e.g. a departed user) and there's no state to cache.
export async function clearUserCreditStatus(
  workspaceId: string,
  userId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.del(buildUserCreditStatusKey(workspaceId, userId));
  });
}

export async function getUserCreditStatus(
  workspaceId: string,
  userId: string
): Promise<UserCreditState> {
  const cached = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildUserCreditStatusKey(workspaceId, userId))
  );

  if (cached && isUserCreditState(cached)) {
    return cached;
  }

  logger.info(
    { workspaceId, userId, userCreditStatusCacheHit: false },
    "[MetronomeUserBlock] Cache miss during user credit status check, falling back to DB"
  );

  const state = await fetchUserCreditStateFromDb({ workspaceId, userId });
  await setUserCreditStatus(workspaceId, userId, state);
  return state;
}

// Per-user AWU 80% warning. Backed by the `*_low_balance` credit states; these
// helpers flip a user between the base state and its low-balance variant. The
// authoritative writer is the credit state machine — these are best-effort
// webhook-driven nudges and degrade to the DB value on a cache miss.

export async function setUserAwuWarned(
  workspaceId: string,
  userId: string
): Promise<void> {
  const current = await getUserCreditStatus(workspaceId, userId);
  const next: UserCreditState =
    current === "user_seat"
      ? "user_seat_low_balance"
      : current === "on_pool" || current === "normal"
        ? "on_pool_low_balance"
        : current;
  if (next !== current) {
    await setUserCreditStatus(workspaceId, userId, next);
  }
}

export async function clearUserAwuWarned(
  workspaceId: string,
  userId: string
): Promise<void> {
  const current = await getUserCreditStatus(workspaceId, userId);
  const next: UserCreditState =
    current === "user_seat_low_balance"
      ? "user_seat"
      : current === "on_pool_low_balance"
        ? "on_pool"
        : current;
  if (next !== current) {
    await setUserCreditStatus(workspaceId, userId, next);
  }
}

export async function isUserAwuWarned(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  return isLowBalanceState(await getUserCreditStatus(workspaceId, userId));
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
  // Each dimension reads its own cache with a DB read-through fallback:
  // `getUserCreditStatus` for the per-user state, `isWorkspacePoolDepleted`
  // for the pool.
  const [creditStatus, workspacePoolDepleted] = await Promise.all([
    getUserCreditStatus(workspaceId, userId),
    isWorkspacePoolDepleted(workspaceId),
  ]);

  return deriveBlockedReason({
    userCapBlocked: creditStatus === "capped",
    workspacePoolDepleted,
  });
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

export async function setWorkspaceProgrammaticDepleted(
  workspaceId: string
): Promise<void> {
  await setFlag(
    buildWorkspaceProgrammaticDepletedKey(workspaceId),
    BLOCKED_FLAG
  );
}

export async function clearWorkspaceProgrammaticDepleted(
  workspaceId: string
): Promise<void> {
  await setFlag(
    buildWorkspaceProgrammaticDepletedKey(workspaceId),
    NOT_BLOCKED_FLAG
  );
}

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
  const depleted = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildWorkspaceProgrammaticDepletedKey(workspaceId))
  );

  if (isBlockFlag(depleted)) {
    return depleted === BLOCKED_FLAG;
  }

  logger.info(
    {
      workspaceId,
      workspaceProgrammaticCacheHit: false,
    },
    "[MetronomeUserBlock] Cache miss during programmatic API blocked check, falling back to DB"
  );

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId },
      "[MetronomeUserBlock] Workspace not found during programmatic API blocked cache read-through fallback"
    );
    return false;
  }

  const programmaticDepleted = workspace.programmaticCreditState === "depleted";
  await setFlag(
    buildWorkspaceProgrammaticDepletedKey(workspaceId),
    programmaticDepleted ? BLOCKED_FLAG : NOT_BLOCKED_FLAG
  );
  return programmaticDepleted;
}

// Whether the workspace pool is depleted (the pool-only dimension of access
// control — no per-user cap). Used directly for API calls, and as one input to
// `isUserBlocked`.
export async function isWorkspacePoolDepleted(
  workspaceId: string
): Promise<boolean> {
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
