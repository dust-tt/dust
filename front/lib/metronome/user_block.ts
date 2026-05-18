// Redis fast-path cache for credit-state-driven access control.
//
// Two orthogonal keys back the credit state machines:
//   - `metronome:user_cap:<ws>:<user>`: set when a user is in `capped` state
//   (per-user spend cap reached). Owned by the user credit state machine.
//   - `metronome:pool_depleted:<ws>`: set when the workspace pool is in
//   `depleted` state (commit balance exhausted and no PAYG / PAYG cap hit).
//   Owned by the workspace credit state machine.
//
// `isUserBlocked` is the unified read: a user is blocked iff either key is
// set. The DB columns (`memberships.creditState`, `workspaces.poolCreditState`)
// remain the source of truth. These keys are derived caches whose writes
// are gated on DB transaction commit via `invalidateCacheAfterCommit`.
//
import { runOnRedis } from "@app/lib/api/redis";

const REDIS_ORIGIN = "metronome_limit" as const;

function buildUserCapKey(workspaceId: string, userId: string): string {
  return `metronome:user_cap:${workspaceId}:${userId}`;
}

function buildWorkspacePoolDepletedKey(workspaceId: string): string {
  return `metronome:pool_depleted:${workspaceId}`;
}

// Per-user cap (user credit state machine)

export async function setUserCapBlocked(
  workspaceId: string,
  userId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(buildUserCapKey(workspaceId, userId), "1");
  });
}

export async function clearUserCapBlocked(
  workspaceId: string,
  userId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.del(buildUserCapKey(workspaceId, userId));
  });
}

// Workspace pool depleted (workspace credit state machine)

export async function setWorkspacePoolDepleted(
  workspaceId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(buildWorkspacePoolDepletedKey(workspaceId), "1");
  });
}

export async function clearWorkspacePoolDepleted(
  workspaceId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.del(buildWorkspacePoolDepletedKey(workspaceId));
  });
}

// Unified read

export async function isUserBlocked(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  return runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    const [userCap, poolDepleted] = await Promise.all([
      client.get(buildUserCapKey(workspaceId, userId)),
      client.get(buildWorkspacePoolDepletedKey(workspaceId)),
    ]);
    return userCap === "1" || poolDepleted === "1";
  });
}
