import { runOnRedisCache } from "@app/lib/api/redis";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import logger from "@app/logger/logger";
import { getCreditTypeAwuId } from "./constants";

const REDIS_ORIGIN = "metronome_credit_cache" as const;
const CACHE_TTL_SECONDS = 60;

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

function seatCreditKey(workspaceSId: string, userSId: string): string {
  return `metronome:seat_credits:${workspaceSId}:${userSId}`;
}

function poolCreditKey(workspaceSId: string): string {
  return `metronome:pool_credits:${workspaceSId}`;
}

// ---------------------------------------------------------------------------
// Low-level Redis helpers (graceful degradation on failure)
// ---------------------------------------------------------------------------

async function getCachedBalance(key: string): Promise<number | null> {
  try {
    const value = await runOnRedisCache({ origin: REDIS_ORIGIN }, (client) =>
      client.get(key)
    );
    if (value === null) {
      return null; // cache miss
    }
    return Number(value);
  } catch (err) {
    logger.error(
      { err, key },
      "[Metronome CreditCache] Redis read failed — allowing usage"
    );
    return null;
  }
}

async function setCachedBalance(key: string, balance: number): Promise<void> {
  try {
    await runOnRedisCache({ origin: REDIS_ORIGIN }, (client) =>
      client.set(key, String(balance), { EX: CACHE_TTL_SECONDS })
    );
  } catch (err) {
    logger.error({ err, key }, "[Metronome CreditCache] Redis write failed");
  }
}

async function deleteCachedKey(key: string): Promise<void> {
  try {
    await runOnRedisCache({ origin: REDIS_ORIGIN }, (client) =>
      client.del(key)
    );
  } catch (err) {
    logger.error({ err, key }, "[Metronome CreditCache] Redis delete failed");
  }
}

// ---------------------------------------------------------------------------
// Metronome fetch (called on cache miss)
// ---------------------------------------------------------------------------

async function fetchAndCachePoolCredits(
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

  const totalBalanceCents = result.value.reduce((sum, entry) => {
    const creditTypeId = entry.access_schedule?.credit_type?.id;
    if (creditTypeId !== getCreditTypeAwuId()) {
      return sum; // skip non-AWU credits
    }
    return sum + (entry.balance ?? 0);
  }, 0);

  await setWorkspacePoolCreditBalance(workspaceSId, totalBalanceCents);
  return totalBalanceCents;
}

// ---------------------------------------------------------------------------
// Public API — read balances
// ---------------------------------------------------------------------------

/**
 * Get the cached per-user seat credit balance (in cents).
 * Returns `null` on cache miss or Redis failure.
 */
export async function getUserSeatCreditBalance(
  workspaceSId: string,
  userSId: string
): Promise<number | null> {
  return getCachedBalance(seatCreditKey(workspaceSId, userSId));
}

/**
 * Get the cached workspace pool credit balance (in cents).
 * Returns `null` on cache miss or Redis failure.
 */
export async function getWorkspacePoolCreditBalance(
  workspaceSId: string
): Promise<number | null> {
  return getCachedBalance(poolCreditKey(workspaceSId));
}

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
 * On cache miss, fetches from Metronome if a customer ID is provided.
 * Returns `null` only when cache misses and no customer ID is available.
 */
export async function hasWorkspacePoolCredits(
  workspaceSId: string,
  metronomeCustomerId?: string | null
): Promise<boolean | null> {
  const balance = await getWorkspacePoolCreditBalance(workspaceSId);
  if (balance === null) {
    if (metronomeCustomerId) {
      const fetched = await fetchAndCachePoolCredits(
        workspaceSId,
        metronomeCustomerId
      );
      return fetched > 0;
    }
    return null;
  }
  return balance > 0;
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
// Public API — write (called by webhook handler + periodic poll)
// ---------------------------------------------------------------------------

/**
 * Set the cached per-user seat credit balance (in cents).
 */
export async function setUserSeatCreditBalance(
  workspaceSId: string,
  userSId: string,
  balanceCents: number
): Promise<void> {
  await setCachedBalance(seatCreditKey(workspaceSId, userSId), balanceCents);
}

/**
 * Set the cached workspace pool credit balance (in cents).
 */
export async function setWorkspacePoolCreditBalance(
  workspaceSId: string,
  balanceCents: number
): Promise<void> {
  await setCachedBalance(poolCreditKey(workspaceSId), balanceCents);
}

// ---------------------------------------------------------------------------
// Public API — invalidation (force re-fetch on next read)
// ---------------------------------------------------------------------------

export async function invalidateUserSeatCredits(
  workspaceSId: string,
  userSId: string
): Promise<void> {
  await deleteCachedKey(seatCreditKey(workspaceSId, userSId));
}

export async function invalidateWorkspacePoolCredits(
  workspaceSId: string
): Promise<void> {
  await deleteCachedKey(poolCreditKey(workspaceSId));
}
