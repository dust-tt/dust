import assert from "node:assert";

import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";
import type { RedisClientType } from "redis";

import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import { runOnRedis } from "@app/lib/api/redis";
import { getWorkspacePublicAPILimits } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  LightWorkspaceType,
  PublicAPILimitsType,
  UserMessageOrigin,
} from "@app/types";

export const USAGE_ORIGINS_CLASSIFICATION: Record<
  UserMessageOrigin,
  "programmatic" | "user"
> = {
  agent_handover: "user",
  api: "programmatic",
  email: "user",
  excel: "programmatic",
  extension: "user",
  "github-copilot-chat": "user",
  gsheet: "programmatic",
  make: "programmatic",
  n8n: "programmatic",
  powerpoint: "programmatic",
  raycast: "user",
  run_agent: "user",
  slack: "user",
  teams: "user",
  transcript: "user",
  triggered_programmatic: "programmatic",
  triggered: "user",
  web: "user",
  zapier: "programmatic",
  zendesk: "programmatic",
  onboarding_conversation: "user",
};

export const USER_USAGE_ORIGINS = Object.keys(
  USAGE_ORIGINS_CLASSIFICATION
).filter(
  (origin) =>
    USAGE_ORIGINS_CLASSIFICATION[origin as UserMessageOrigin] === "user"
);

const PROGRAMMATIC_USAGE_ORIGINS = Object.keys(
  USAGE_ORIGINS_CLASSIFICATION
).filter(
  (origin) =>
    USAGE_ORIGINS_CLASSIFICATION[origin as UserMessageOrigin] === "programmatic"
);

// Programmatic usage tracking: keep Redis key name for backward compatibility.
const PROGRAMMATIC_USAGE_REMAINING_CREDITS_KEY = "public_api_remaining_credits";
const REDIS_ORIGIN = "public_api_limits";

function getRedisKey(workspace: LightWorkspaceType): string {
  return `${PROGRAMMATIC_USAGE_REMAINING_CREDITS_KEY}:${workspace.id}`;
}

const USERS_HAVE_BEEN_WARNED = false;

export function isProgrammaticUsage(
  auth: Authenticator,
  { userMessageOrigin }: { userMessageOrigin?: UserMessageOrigin | null } = {}
): boolean {
  // TODO(2025-12-01 PPUL): Remove once PPUL is out.
  if (auth.isKey() && !auth.isSystemKey()) {
    return true;
  }

  // Track for API keys, listed programmatic origins or unspecified user message origins.
  // This must be in sync with the getShouldTrackTokenUsageCostsESFilter function.
  // TODO(PPUL): enforce passing non-null userMessageOrigin.
  if (!userMessageOrigin) {
    logger.warn(
      { workspaceId: auth.getNonNullableWorkspace().sId },
      "No user message origin provided, assuming non-programmatic usage for now"
    );
    return false;
  }

  if (
    auth.authMethod() === "api_key" ||
    // TODO(PPUL): remove this after notifying users.
    (USERS_HAVE_BEEN_WARNED &&
      USAGE_ORIGINS_CLASSIFICATION[userMessageOrigin] === "programmatic") ||
    userMessageOrigin === "triggered_programmatic"
  ) {
    return true;
  }

  return false;
}

export function getShouldTrackTokenUsageCostsESFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const workspace = auth.getNonNullableWorkspace();

  // Track for API keys, listed programmatic origins or unspecified user message origins.
  // This must be in sync with the shouldTrackTokenUsageCosts function.
  const shouldClauses: estypes.QueryDslQueryContainer[] = [
    { term: { auth_method: "api_key" } },
    { bool: { must_not: { exists: { field: "context_origin" } } } },
    { terms: { context_origin: PROGRAMMATIC_USAGE_ORIGINS } },
  ];

  return {
    bool: {
      filter: [
        { term: { workspace_id: workspace.sId } },
        {
          bool: {
            should: shouldClauses,
            minimum_should_match: 1,
          },
        },
      ],
    },
  };
}

export async function hasReachedProgrammaticUsageLimits(
  auth: Authenticator,
  shouldTrack: boolean = false
): Promise<boolean> {
  if (!isProgrammaticUsage(auth) && !shouldTrack) {
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

// TODO(PPUL): remove this method once we switch to new credits tracking system.
const TEMP_FAKE_LIMITS: PublicAPILimitsType & { enabled: true } = {
  monthlyLimit: 1_000_000, // 10_000 USD
  markup: 30,
  billingDay: 1,
  enabled: true,
};
async function decreaseProgrammaticCredits(
  workspace: LightWorkspaceType,
  amount: number
): Promise<void> {
  const rawLimits = getWorkspacePublicAPILimits(workspace);

  const limits: PublicAPILimitsType = rawLimits?.enabled
    ? rawLimits
    : TEMP_FAKE_LIMITS;

  // Apply markup.
  const amountWithMarkup = amount * (1 + limits.markup / 100);

  await runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    const key = getRedisKey(workspace);
    const remainingCredits = await redis.get(key);

    // If no credits are set yet, initialize with monthly limit.
    if (remainingCredits === null) {
      await initializeCredits(redis, workspace, limits.monthlyLimit);

      return;
    }

    // We track credit consumption in a best-effort manner. If a message consumes more credits than
    // remaining, we allow the negative balance to be recorded. This ensures we have an accurate
    // record of over-usage, while hasReachedPublicAPILimits will block subsequent calls when
    // detecting negative credits.
    const newCredits = parseFloat(remainingCredits) - amountWithMarkup;
    // Preserve the TTL of the key.
    await redis.set(key, newCredits.toString(), { KEEPTTL: true });
  });
}

// There's a race condition here if many messages are running at the same time.
// This method might be called with credits depleted. In that case we log amounts
// for tracking but do not take any other action.
export async function decreaseProgrammaticCreditsV2(
  auth: Authenticator,
  { amountCents }: { amountCents: number }
): Promise<void> {
  const activeCredits = await CreditResource.listActive(auth);

  const sortedCredits = [...activeCredits].sort(compareCreditsForConsumption);

  let remainingAmount = amountCents;
  while (remainingAmount > 0) {
    const credit = sortedCredits.shift();
    if (!credit) {
      // A simple warn suffices; tokens have already been consumed.
      logger.warn(
        {
          initialAmount: amountCents,
          remainingAmount,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "No more credits available for this message cost."
      );
      break;
    }
    const amountToConsume = Math.min(
      remainingAmount,
      credit.initialAmountCents - credit.consumedAmountCents
    );
    const result = await credit.consume(amountToConsume);
    if (result.isErr()) {
      logger.error(
        {
          amount: amountToConsume,
          workspaceId: auth.getNonNullableWorkspace().sId,
          // For eng on-call: this error should be investigated since it likely
          // reveals an underlying issue in our billing / credit logic. The only
          // legitimate case this error could happen would be a race condition
          // in which two messages consume the same credit at exactly the same
          // time--in which case it's a no-op, but at time of writing this is
          // considered very unlikely. Double check first before skipping.
          panic: true,
          error: result.error,
        },
        "Error consuming credit."
      );
      break;
    }
    remainingAmount -= amountToConsume;
  }
}

// TODO(PPUL): remove this method once we switch to new credits tracking system.
async function initializeCredits(
  redis: RedisClientType,
  workspace: LightWorkspaceType,
  monthlyLimit: number
): Promise<void> {
  const key = getRedisKey(workspace);
  const rawLimits = getWorkspacePublicAPILimits(workspace);
  const limits: PublicAPILimitsType = rawLimits?.enabled
    ? rawLimits
    : TEMP_FAKE_LIMITS;

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

export async function trackProgrammaticCost(
  auth: Authenticator,
  {
    dustRunIds,
    userMessageOrigin,
  }: { dustRunIds: string[]; userMessageOrigin?: UserMessageOrigin | null }
) {
  if (!isProgrammaticUsage(auth, { userMessageOrigin })) {
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
  // TODO(2025-12-01 PPUL): microdollars here, floats are not safe for accumulating like this.
  const runsCostUsd = runUsages
    .flat()
    .reduce((acc, usage) => acc + usage.costUsd, 0);
  const runsCostUsdFloored = runsCostUsd > 0 ? Math.ceil(runsCostUsd) : 0;

  await decreaseProgrammaticCredits(
    auth.getNonNullableWorkspace(),
    runsCostUsdFloored
  );
  const costWithMarkupCents = Math.ceil(
    // Explicit dollar conversion and percentage.
    runsCostUsdFloored * (1 + DUST_MARKUP_PERCENT / 100) * 100
  );
  await decreaseProgrammaticCreditsV2(auth, {
    amountCents: costWithMarkupCents,
  });
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
// First free credits, then committed credits, lastly pay-as-you-go, by expiration date (earliest first).
export function compareCreditsForConsumption(
  a: CreditResource,
  b: CreditResource
): number {
  if (a.type === "free" && b.type !== "free") {
    return -1;
  }
  if (a.type !== "free" && b.type === "free") {
    return 1;
  }
  if (a.type === "committed" && b.type !== "committed") {
    return -1;
  }
  if (a.type !== "committed" && b.type === "committed") {
    return 1;
  }

  // TODO(PPUL): in following PR, we will make expiration date non-nullable.
  assert(a.expirationDate && b.expirationDate, "Expiration date is required");
  return a.expirationDate.getTime() - b.expirationDate.getTime();
}
