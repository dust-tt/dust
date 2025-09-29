import moment from "moment-timezone";
import type { RedisClientType } from "redis";

import { calculateTokenUsageCost } from "@app/lib/api/assistant/token_pricing";
import { runOnRedis } from "@app/lib/api/redis";
import { getWorkspacePublicAPILimits } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types";

const PUBLIC_API_REMAINING_CREDITS_KEY = "public_api_remaining_credits";
const REDIS_ORIGIN = "public_api_limits";

function getRedisKey(workspace: LightWorkspaceType): string {
  return `${PUBLIC_API_REMAINING_CREDITS_KEY}:${workspace.id}`;
}

function shouldTrackTokenUsageCosts(auth: Authenticator): boolean {
  // Only compute token usage for API keys.
  if (!auth.isKey() || auth.isSystemKey()) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  const limits = getWorkspacePublicAPILimits(workspace);
  if (!limits?.enabled) {
    return false;
  }

  return true;
}

export async function hasReachedPublicAPILimits(
  auth: Authenticator
): Promise<boolean> {
  if (!shouldTrackTokenUsageCosts(auth)) {
    return false;
  }

  const owner = auth.getNonNullableWorkspace();
  const limits = getWorkspacePublicAPILimits(owner);
  if (!limits?.enabled) {
    return false;
  }

  return runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    const key = getRedisKey(owner);
    const remainingCredits = await redis.get(key);

    // If no credits are set yet, initialize with monthly limit.
    if (remainingCredits === null) {
      await initializeCredits(redis, owner, limits.monthlyLimit);
      return false;
    }

    return parseFloat(remainingCredits) <= 0;
  });
}

async function trackTokenUsageCost(
  workspace: LightWorkspaceType,
  amount: number
): Promise<number> {
  const limits = getWorkspacePublicAPILimits(workspace);
  if (!limits?.enabled) {
    return Infinity; // No limits means unlimited credits.
  }

  // Apply markup.
  const amountWithMarkup = amount * (1 + limits.markup / 100);

  return runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    const key = getRedisKey(workspace);
    const remainingCredits = await redis.get(key);

    // If no credits are set yet, initialize with monthly limit.
    if (remainingCredits === null) {
      await initializeCredits(redis, workspace, limits.monthlyLimit);

      return limits.monthlyLimit;
    }

    // We track credit consumption in a best-effort manner. If a message consumes more credits than
    // remaining, we allow the negative balance to be recorded. This ensures we have an accurate
    // record of over-usage, while hasReachedPublicAPILimits will block subsequent calls when
    // detecting negative credits.
    const newCredits = parseFloat(remainingCredits) - amountWithMarkup;
    // Preserve the TTL of the key.
    await redis.set(key, newCredits.toString(), { KEEPTTL: true });
    return newCredits;
  });
}

async function initializeCredits(
  redis: RedisClientType,
  workspace: LightWorkspaceType,
  monthlyLimit: number
): Promise<void> {
  const key = getRedisKey(workspace);
  const limits = getWorkspacePublicAPILimits(workspace);

  if (!limits?.enabled) {
    return;
  }

  // Calculate expiry time (end of current billing period).
  const now = moment();
  const { billingDay } = limits;

  // Set the billing day for the current month.
  let periodEnd = moment().date(billingDay);

  // If we've passed the billing day this month, use next month's billing day.
  if (now.date() >= billingDay) {
    periodEnd = moment().add(1, "month").date(billingDay);
  }

  const secondsUntilEnd = periodEnd.diff(now, "seconds");

  // Set initial credits with expiry.
  await redis.set(key, monthlyLimit.toString());
  await redis.expire(key, secondsUntilEnd);
}

async function maybeTrackTokenUsageCost(
  auth: Authenticator,
  { dustRunIds }: { dustRunIds: string[] }
) {
  if (!shouldTrackTokenUsageCosts(auth)) {
    return;
  }

  // Retrieve all runs for the given run ids.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });

  // Compute the token usage for each run.
  const runUsages = await concurrentExecutor(
    runs,
    async (run) => {
      return run.listRunUsages(auth);
    },
    { concurrency: 10 }
  );

  // There is a race condition where the run is not created before we emit the event.
  if (runUsages.length === 0 && dustRunIds.length > 0) {
    logger.error({ dustRunIds }, "No run usages found for the given run ids");
  }

  // Compute the price for all the runs.
  const runsCost = calculateTokenUsageCost(runUsages.flat());

  await trackTokenUsageCost(auth.getNonNullableWorkspace(), runsCost);
}

export async function resetCredits(
  workspace: LightWorkspaceType,
  { newCredits }: { newCredits?: number } = {}
): Promise<void> {
  return runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    if (newCredits) {
      await initializeCredits(redis, workspace, newCredits);
    } else {
      const key = getRedisKey(workspace);

      await redis.del(key);
    }
  });
}

export async function getRemainingCredits(
  workspace: LightWorkspaceType
): Promise<{ expiresInSeconds: number; remainingCredits: number } | null> {
  return runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    const key = getRedisKey(workspace);
    const remainingCredits = await redis.get(key);
    if (remainingCredits === null) {
      return null;
    }

    const expiresInSeconds = await redis.ttl(key);

    return {
      expiresInSeconds,
      remainingCredits: parseFloat(remainingCredits),
    };
  });
}
