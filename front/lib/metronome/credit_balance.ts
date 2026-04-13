import { listMetronomeBalances } from "@app/lib/metronome/client";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import { getCreditTypeAwuId } from "./constants";

const CACHE_TTL_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Seat credits — read-through cache via cacheWithRedis
// ---------------------------------------------------------------------------

// TODO: implement seat credit fetching from Metronome.
// For now, we return a positive value so we don't block the user.
async function fetchSeatCredits(
  _workspaceSId: string,
  _userSId: string
): Promise<number> {
  return 1;
}

export const getCachedSeatCredits = cacheWithRedis(
  fetchSeatCredits,
  (workspaceSId, userSId) => `${workspaceSId}:${userSId}`,
  { ttlMs: CACHE_TTL_MS }
);

// ---------------------------------------------------------------------------
// Pool credits — read-through cache via cacheWithRedis
// ---------------------------------------------------------------------------

async function fetchPoolCredits(
  workspaceSId: string,
  metronomeCustomerId: string
): Promise<number> {
  const result = await listMetronomeBalances(metronomeCustomerId);
  if (result.isErr()) {
    logger.warn(
      { workspaceSId, metronomeCustomerId, error: result.error },
      "[Metronome CreditCache] Failed to fetch balances — allowing usage"
    );
    // Fail-open: return a positive value so we don't block the user.
    return 1;
  }

  return result.value.reduce((sum, entry) => {
    const creditTypeId = entry.access_schedule?.credit_type?.id;
    if (creditTypeId !== getCreditTypeAwuId()) {
      return sum; // skip non-AWU credits
    }
    return sum + (entry.balance ?? 0);
  }, 0);
}

const getCachedPoolCredits = cacheWithRedis(
  fetchPoolCredits,
  (workspaceSId) => workspaceSId,
  { ttlMs: CACHE_TTL_MS }
);

// ---------------------------------------------------------------------------
// Public API — boolean checks
// ---------------------------------------------------------------------------

/**
 * Seat credit distinction is not implemented yet — always allow.
 */
export async function hasUserSeatCredits(
  _workspaceSId: string,
  _userSId: string
): Promise<boolean> {
  // TODO: implement seat credit tracking and enforcement.
  // For now, we return `true` to allow usage.
  return true;
}

/**
 * Check whether the workspace pool (committed + PAYG) still has credits.
 * Uses a read-through Redis cache backed by Metronome.
 * Returns `null` when no customer ID is available.
 */
export async function hasWorkspacePoolCredits(
  workspaceSId: string,
  metronomeCustomerId?: string | null
): Promise<boolean | null> {
  if (!metronomeCustomerId) {
    return null;
  }
  const balance = await getCachedPoolCredits(workspaceSId, metronomeCustomerId);
  return balance !== null && balance > 0;
}

/**
 * Combined check: returns true if the user has seat credits OR the workspace
 * pool has credits. Gracefully degrades to `true` when Redis is unavailable
 * or cache is cold and no Metronome customer ID is available.
 */
export async function hasCredits(
  workspaceSId: string,
  userSId: string,
  metronomeCustomerId?: string | null
): Promise<boolean> {
  const [seatResult, poolResult] = await Promise.all([
    hasUserSeatCredits(workspaceSId, userSId),
    hasWorkspacePoolCredits(workspaceSId, metronomeCustomerId),
  ]);

  if (seatResult === false && poolResult === false) {
    return false;
  }

  // If either has credits, allow.
  return true;
}

// ---------------------------------------------------------------------------
// Public API — invalidation (force re-fetch on next read)
// ---------------------------------------------------------------------------

export const invalidateUserSeatCredits = invalidateCacheWithRedis(
  fetchSeatCredits,
  (workspaceSId: string, userSId: string) => `${workspaceSId}:${userSId}`
);

export const invalidateWorkspacePoolCredits = invalidateCacheWithRedis(
  fetchPoolCredits,
  (workspaceSId: string) => workspaceSId
);
