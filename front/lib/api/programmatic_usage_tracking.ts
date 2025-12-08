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
import { launchCreditAlertWorkflow } from "@app/temporal/credit_alerts/client";
import type {
  LightWorkspaceType,
  PublicAPILimitsType,
  UserMessageOrigin,
} from "@app/types";
import { isString } from "@app/types";

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
  slack_workflow: "programmatic",
  teams: "user",
  transcript: "user",
  triggered_programmatic: "programmatic",
  triggered: "user",
  web: "user",
  zapier: "programmatic",
  zendesk: "programmatic",
  onboarding_conversation: "user",
};

const CREDIT_ALERT_THRESHOLD_PERCENT = 80;

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
    USAGE_ORIGINS_CLASSIFICATION[userMessageOrigin] === "programmatic"
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
  auth: Authenticator
): Promise<boolean> {
  return (await CreditResource.listActive(auth)).length === 0;
}

// TODO(PPUL): remove this method once we switch to new credits tracking system.
const TEMP_FAKE_LIMITS: PublicAPILimitsType & { enabled: true } = {
  monthlyLimit: 10_000, // 10_000 USD
  markup: 30,
  billingDay: 1,
  enabled: true,
};
async function decreaseProgrammaticCredits(
  workspace: LightWorkspaceType,
  { amountMicroUsd }: { amountMicroUsd: number }
): Promise<void> {
  const rawLimits = getWorkspacePublicAPILimits(workspace);

  const limits: PublicAPILimitsType = rawLimits?.enabled
    ? rawLimits
    : TEMP_FAKE_LIMITS;

  // Apply markup.
  const amountMicroUsdWithMarkup = amountMicroUsd * (1 + limits.markup / 100);

  await runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    const key = getRedisKey(workspace);
    const remainingCreditsUsd = await redis.get(key);

    // If no credits are set yet, initialize with monthly limit.
    if (remainingCreditsUsd === null) {
      await initializeCredits(redis, workspace, limits.monthlyLimit);

      return;
    }

    // We track credit consumption in a best-effort manner. If a message consumes more credits than
    // remaining, we allow the negative balance to be recorded. This ensures we have an accurate
    // record of over-usage, while hasReachedPublicAPILimits will block subsequent calls when
    // detecting negative credits.
    const newCreditsUsd =
      parseFloat(remainingCreditsUsd) - amountMicroUsdWithMarkup / 1_000_000;

    // Preserve the TTL of the key.
    await redis.set(key, newCreditsUsd.toString(), { KEEPTTL: true });
  });
}

// There's a race condition here if many messages are running at the same time.
// This method might be called with credits depleted. In that case we log amounts
// for tracking but do not take any other action.
export async function decreaseProgrammaticCreditsV2(
  auth: Authenticator,
  { amountMicroUsd }: { amountMicroUsd: number }
): Promise<{ totalConsumedMicroUsd: number; totalInitialMicroUsd: number }> {
  const workspace = auth.getNonNullableWorkspace();
  const activeCredits = await CreditResource.listActive(auth);

  const sortedCredits = [...activeCredits].sort(compareCreditsForConsumption);

  const totalConsumedBeforeMicroUsd = activeCredits.reduce(
    (sum, c) => sum + c.consumedAmountMicroUsd,
    0
  );
  const totalInitialMicroUsd = activeCredits.reduce(
    (sum, c) => sum + c.initialAmountMicroUsd,
    0
  );

  let remainingAmountMicroUsd = amountMicroUsd;
  let consumedAmountMicroUsd = 0;

  while (remainingAmountMicroUsd > 0) {
    const credit = sortedCredits.shift();
    if (!credit) {
      // A simple warn suffices; tokens have already been consumed.
      logger.warn(
        {
          initialAmountMicroUsd: amountMicroUsd,
          remainingAmountMicroUsd,
          workspaceId: workspace.sId,
        },
        "No more credits available for this message cost."
      );
      break;
    }
    const amountToConsumeMicroUsd = Math.min(
      remainingAmountMicroUsd,
      credit.initialAmountMicroUsd - credit.consumedAmountMicroUsd
    );

    const result = await credit.consume({
      amountInMicroUsd: amountToConsumeMicroUsd,
    });
    if (result.isErr()) {
      logger.error(
        {
          amountToConsumeInMicroUsd: amountToConsumeMicroUsd,
          workspaceId: workspace.sId,
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

    consumedAmountMicroUsd += amountToConsumeMicroUsd;
    remainingAmountMicroUsd -= amountToConsumeMicroUsd;
  }

  return {
    totalConsumedMicroUsd: totalConsumedBeforeMicroUsd + consumedAmountMicroUsd,
    totalInitialMicroUsd: totalInitialMicroUsd,
  };
}

// TODO(PPUL): remove this method once we switch to new credits tracking system.
async function initializeCredits(
  redis: RedisClientType,
  workspace: LightWorkspaceType,
  monthlyLimitUsd: number
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
  await redis.set(key, monthlyLimitUsd.toString());
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
  const runsCostMicroUsd = runUsages
    .flat()
    .reduce((acc, usage) => acc + usage.costMicroUsd, 0);

  await decreaseProgrammaticCredits(auth.getNonNullableWorkspace(), {
    amountMicroUsd: runsCostMicroUsd,
  });

  const costWithMarkupMicroUsd = Math.ceil(
    runsCostMicroUsd * (1 + DUST_MARKUP_PERCENT / 100)
  );
  const { totalConsumedMicroUsd, totalInitialMicroUsd } =
    await decreaseProgrammaticCreditsV2(auth, {
      amountMicroUsd: costWithMarkupMicroUsd,
    });

  if (totalInitialMicroUsd > 0) {
    const thresholdMicroUsd = Math.floor(
      (totalInitialMicroUsd * CREDIT_ALERT_THRESHOLD_PERCENT) / 100
    );
    if (totalConsumedMicroUsd >= thresholdMicroUsd) {
      const workspace = auth.getNonNullableWorkspace();
      const idempotencyKey = workspace.metadata?.creditAlertIdempotencyKey;
      // For eng-oncall:
      // If you get this, you can defer to programmatic usage owners right away
      // Every workspace should have this key defined
      // If not, it means they will not get alerted
      // when they reached their usage threshold
      assert(
        isString(idempotencyKey),
        "creditAlertThresholdId must be set when credits exist"
      );
      void launchCreditAlertWorkflow({
        workspaceId: workspace.sId,
        idempotencyKey: idempotencyKey,
        totalInitialMicroUsd,
        totalConsumedMicroUsd,
      });
    }
  }
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
