import assert from "node:assert";

import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import { isProgrammaticUsageFromContext } from "@app/lib/api/programmatic_usage/common";
import {
  hasReachedDailyUsageCap,
  incrementDailyUsageMicroUsd,
} from "@app/lib/api/programmatic_usage/daily_cap";
import {
  hasKeyReachedUsageCap,
  incrementRedisKeyUsageMicroUsd,
} from "@app/lib/api/programmatic_usage/key_cap";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { computeRunFingerprint } from "@app/lib/credits/agent_message_billing";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";

import { launchCreditAlertWorkflow } from "@app/temporal/credit_alerts/client";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const CREDIT_ALERT_THRESHOLD_PERCENT = 80;

// TTL on the per-execution idempotency marker guarding credit consumption.
// Activity retries span minutes; 24 hours comfortably covers late zombie
// attempts without accumulating keys forever.
const CONSUMED_RUNS_GUARD_TTL_SECONDS = 24 * 60 * 60;

const TRACKING_REDIS_ORIGIN = "programmatic_usage_tracking" as const;

/**
 * Marks the given agent-loop execution (identified by its run fingerprint) as
 * consumed. Returns false when another attempt already consumed it — the caller
 * must then skip the mutation phase so activity retries and timed-out zombie
 * attempts never consume the same runs twice. The marker is set before the
 * mutations and deliberately never released: a crash inside the mutation window
 * leaves it held, so the retry drops that execution instead of risking double
 * consumption. Do not delete the marker on failure. Redis errors propagate
 * (fail closed): without the marker we cannot guarantee at-most-once
 * consumption, so the attempt fails and Temporal retries.
 *
 * Known limit: the marker is only as durable as Redis. If Redis loses it
 * (eviction, failover) between a post-consumption crash and its retry, that
 * one execution can be counted twice. Accepted trade-off: closing it needs a
 * ledger-transactional marker (new table), which is not worth it for a
 * cents-level tail risk.
 */
async function tryMarkRunsConsumed(
  auth: Authenticator,
  dustRunIds: string[]
): Promise<boolean> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const guardKey = `programmatic_usage_consumed:${workspaceId}:${computeRunFingerprint(dustRunIds)}`;
  const res = await runOnRedis({ origin: TRACKING_REDIS_ORIGIN }, (redis) =>
    redis.set(guardKey, "1", {
      NX: true,
      EX: CONSUMED_RUNS_GUARD_TTL_SECONDS,
    })
  );
  return res === "OK";
}

type ProgrammaticUsageLimitErrorType = "credits_exhausted" | "rate_limit_error";

class ProgrammaticUsageLimitError extends Error {
  type: ProgrammaticUsageLimitErrorType;

  constructor(type: ProgrammaticUsageLimitErrorType, message: string) {
    super(message);
    this.type = type;
  }
}

export function isProgrammaticUsage(
  auth: Authenticator,
  { userMessageOrigin }: { userMessageOrigin: UserMessageOrigin }
): boolean {
  return isProgrammaticUsageFromContext({
    authMethod: auth.authMethod(),
    userMessageOrigin,
  });
}

async function hasReachedProgrammaticUsageLimits(
  auth: Authenticator
): Promise<boolean> {
  return (await CreditResource.listActive(auth)).length === 0;
}

/**
 * Check if programmatic usage limits have been reached.
 * Checks workspace credits, per-key caps, and daily cap.
 * Returns Ok if no limit reached, Err with message if a limit was reached.
 */
export async function checkProgrammaticUsageLimits(
  auth: Authenticator
): Promise<Result<void, ProgrammaticUsageLimitError>> {
  const isAdmin = auth.isAdmin();

  // First check workspace credits.
  const hasNoCredits = await hasReachedProgrammaticUsageLimits(auth);
  if (hasNoCredits) {
    const message = isAdmin
      ? "Your workspace has run out of programmatic usage credits. " +
        "Please purchase more credits in the Developers > Credits section of the Dust dashboard."
      : "Your workspace has run out of programmatic usage credits. " +
        "Please ask a Dust workspace admin to purchase more credits.";
    return new Err(
      new ProgrammaticUsageLimitError("credits_exhausted", message)
    );
  }

  // Then check per-key cap (legacy plans only — ES usage tally). Credit-priced
  // plans enforce the per-key credit cap in the message gate (conversation.ts /
  // the front-api conversations route), where the credit-priced branch lives;
  // this function is only reached on the legacy branch.
  const plan = auth.subscription()?.plan;
  if (!plan || !isCreditPricedPlan(plan)) {
    const keyCapReached = await hasKeyReachedUsageCap(auth);
    if (keyCapReached) {
      const message = isAdmin
        ? "This API key has reached its monthly usage cap. " +
          "Please increase the cap in the Developers > API Keys section of the Dust dashboard."
        : "This API key has reached its monthly usage cap. " +
          "Please ask a Dust workspace admin to increase the cap.";
      return new Err(
        new ProgrammaticUsageLimitError("rate_limit_error", message)
      );
    }
  }

  // Finally check daily cap.
  const dailyCapReached = await hasReachedDailyUsageCap(auth);
  if (dailyCapReached) {
    const message = isAdmin
      ? "Your workspace has reached its daily programmatic usage cap. " +
        "The cap will reset at midnight UTC, or you can increase it in admin settings."
      : "Your workspace has reached its daily programmatic usage cap. " +
        "Please contact your Dust workspace admin.";
    return new Err(
      new ProgrammaticUsageLimitError("rate_limit_error", message)
    );
  }

  return new Ok(undefined);
}

// There's a race condition here if many messages are running at the same time.
// This method might be called with credits depleted. In that case we log amounts
// for tracking but do not take any other action.
export async function decreaseProgrammaticCredits(
  auth: Authenticator,
  {
    amountMicroUsd,
    userMessageOrigin,
    // Callers holding the idempotency marker prefetch credits BEFORE setting
    // it, so a read failure retries instead of dropping the execution.
    prefetchedActiveCredits,
  }: {
    amountMicroUsd: number;
    userMessageOrigin: UserMessageOrigin;
    prefetchedActiveCredits?: CreditResource[];
  },
  parentLogger?: Logger
): Promise<{
  totalConsumedMicroUsd: number;
  totalInitialMicroUsd: number;
  activeCredits: CreditResource[];
}> {
  const localLogger = parentLogger ?? logger;
  const workspace = auth.getNonNullableWorkspace();
  const activeCredits =
    prefetchedActiveCredits ?? (await CreditResource.listActive(auth));

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
      // Create an excess credit to track over-consumption.
      // This ensures that sum(consumed credits) = total usage.
      const now = new Date();
      try {
        await CreditResource.makeNew(auth, {
          type: "excess",
          initialAmountMicroUsd: remainingAmountMicroUsd,
          consumedAmountMicroUsd: remainingAmountMicroUsd,
          startDate: now,
          expirationDate: now,
        });
        localLogger.warn(
          {
            initialAmountMicroUsd: amountMicroUsd,
            remainingAmountMicroUsd,
          },
          "[Programmatic Usage Tracking] No more credits available, created excess credit."
        );
      } catch (err) {
        localLogger.error(
          {
            initialAmountMicroUsd: amountMicroUsd,
            remainingAmountMicroUsd,
            error: err,
          },
          "[Programmatic Usage Tracking] Failed to create excess credit."
        );
      }

      // Emit both metrics for backwards compatibility with existing dashboards.
      getStatsDClient().increment("credits.consumption.blocked", 1, [
        `workspace_id:${workspace.sId}`,
        `origin:${userMessageOrigin}`,
      ]);
      getStatsDClient().increment("credits.consumption.excess", 1, [
        `workspace_id:${workspace.sId}`,
        `origin:${userMessageOrigin}`,
      ]);

      consumedAmountMicroUsd += remainingAmountMicroUsd;
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
      localLogger.error(
        {
          amountToConsumeMicroUsd,
          consumedAmountMicroUsd,
          remainingAmountMicroUsd,
          // For eng on-call: this error should be investigated since it likely
          // reveals an underlying issue in our billing / credit logic. The only
          // legitimate case this error could happen would be a race condition
          // in which two messages consume the same credit at exactly the same
          // time--in which case it's a no-op, but at time of writing this is
          // considered very unlikely. Double check first before skipping.
          panic: true,
          error: result.error,
        },
        "[Programmatic Usage Tracking] Error consuming credit."
      );
      getStatsDClient().increment("credits.consumption.error", 1, [
        `workspace_id:${workspace.sId}`,
        `origin:${userMessageOrigin}`,
      ]);
      break;
    }
    consumedAmountMicroUsd += amountToConsumeMicroUsd;
    remainingAmountMicroUsd -= amountToConsumeMicroUsd;

    localLogger.info(
      {
        amountToConsumeMicroUsd,
        consumedAmountMicroUsd,
        remainingAmountMicroUsd,
      },
      "[Programmatic Usage Tracking] Consumed credits"
    );
  }

  getStatsDClient().increment("credits.consumption.success", 1, [
    `workspace_id:${workspace.sId}`,
    `origin:${userMessageOrigin}`,
  ]);
  return {
    totalConsumedMicroUsd: totalConsumedBeforeMicroUsd + consumedAmountMicroUsd,
    totalInitialMicroUsd: totalInitialMicroUsd,
    activeCredits,
  };
}

/**
 * Returns a key used to construct a workflowId for credit alerts
 * We use temporal's strong guarantees on idempotency - only one succeed workflow per workflow id
 * How do we construct this key ?
 * We "fingerprint" your pool of available credits by taking the ids of the most recent committed and free by credit started date
 * Which means that when a new credit is started, the key will change, which means a new email will be triggered if consumption crosses 80% threshold.
 * Otherwise, the key will be invariant.
 *
 **/
export function computeCreditAlertThresholdKey(
  activeCredits: Pick<CreditResource, "type" | "startDate" | "sId">[],
  thresholdPercent: number
): string {
  const sortByStartDateDesc = (
    a: Pick<CreditResource, "startDate">,
    b: Pick<CreditResource, "startDate">
  ) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0);

  const firstFreeCredit = activeCredits
    .filter((c) => c.type === "free")
    .sort(sortByStartDateDesc)[0];

  const firstCommittedCredit = activeCredits
    .filter((c) => c.type === "committed")
    .sort(sortByStartDateDesc)[0];

  const freeId = firstFreeCredit?.sId;
  const committedId = firstCommittedCredit?.sId;

  return `${freeId}-${committedId}-${thresholdPercent}`;
}

export async function trackProgrammaticCost(
  auth: Authenticator,
  {
    dustRunIds,
    userMessageOrigin,
  }: {
    dustRunIds: string[];
    userMessageOrigin: UserMessageOrigin;
  },
  parentLogger?: Logger
) {
  const localLogger = parentLogger ?? logger;

  if (!isProgrammaticUsage(auth, { userMessageOrigin })) {
    return;
  }

  // Credit-priced (Metronome) plans don't use the legacy credit ledger. Bypass
  // the whole tracking path to avoid decrementing nonexistent credits or
  // creating excess rows.
  const plan = auth.subscription()?.plan;
  if (plan && isCreditPricedPlan(plan)) {
    return;
  }

  // Retrieve all runs for the given run ids.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });

  // Compute the token usage for each run.
  const runUsages = await RunResource.listRunUsagesForRuns(auth, { runs });

  // There is a race condition where the run is not created before we emit the event.
  if (runUsages.length === 0 && dustRunIds.length > 0) {
    logger.error({ dustRunIds }, "No run usages found for the given run ids");
  }

  // Compute the price for all the runs.
  const runsCostMicroUsd = runUsages.reduce(
    (acc, usage) => acc + usage.costMicroUsd,
    0
  );

  const costWithMarkupMicroUsd = Math.ceil(
    runsCostMicroUsd * (1 + DUST_MARKUP_PERCENT / 100)
  );

  // Prefetch the credits before setting the marker: reads are safe to retry,
  // and once the marker is held a failure drops the execution.
  const prefetchedActiveCredits = await CreditResource.listActive(auth);

  // Everything above is read-only and safe to retry; everything below mutates
  // (credit ledger, redis counters). Guard the mutation phase so an activity
  // retry after a partial failure never consumes the same runs twice.
  const isFirstConsumption = await tryMarkRunsConsumed(auth, dustRunIds);
  if (!isFirstConsumption) {
    localLogger.warn(
      { dustRunIds },
      "[Programmatic Usage Tracking] Runs already consumed by a previous attempt. Skipping."
    );
    return;
  }

  const { totalConsumedMicroUsd, totalInitialMicroUsd, activeCredits } =
    await decreaseProgrammaticCredits(
      auth,
      {
        amountMicroUsd: costWithMarkupMicroUsd,
        userMessageOrigin,
        prefetchedActiveCredits,
      },
      localLogger
    );

  const keyAuth = auth.key();
  if (keyAuth) {
    await incrementRedisKeyUsageMicroUsd(keyAuth.id, costWithMarkupMicroUsd);
  }

  // Increment daily usage tracking.
  const workspace = auth.getNonNullableWorkspace();
  await incrementDailyUsageMicroUsd(workspace.sId, costWithMarkupMicroUsd);

  if (totalInitialMicroUsd > 0) {
    const thresholdMicroUsd = Math.floor(
      (totalInitialMicroUsd * CREDIT_ALERT_THRESHOLD_PERCENT) / 100
    );
    if (totalConsumedMicroUsd >= thresholdMicroUsd) {
      const workspace = auth.getNonNullableWorkspace();
      getStatsDClient().increment("credits.consumption.alert", 1, [
        `workspace_id:${workspace.sId}`,
        `origin:${userMessageOrigin}`,
      ]);
      const creditAlertThresholdKey = computeCreditAlertThresholdKey(
        activeCredits,
        CREDIT_ALERT_THRESHOLD_PERCENT
      );
      await launchCreditAlertWorkflow({
        workspaceId: workspace.sId,
        creditAlertThresholdKey,
        totalInitialMicroUsd,
        totalConsumedMicroUsd,
      });
    }
  }

  return {
    runsCostMicroUsd,
  };
}

// First free credits, then committed credits, lastly pay-as-you-go, by expiration date (earliest first).
export function compareCreditsForConsumption(
  a: Pick<CreditResource, "type" | "expirationDate">,
  b: Pick<CreditResource, "type" | "expirationDate">
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
