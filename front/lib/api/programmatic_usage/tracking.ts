import assert from "node:assert";

import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import { USAGE_ORIGINS_CLASSIFICATION } from "@app/lib/api/programmatic_usage/common";
import {
  hasReachedDailyUsageCap,
  incrementDailyUsageMicroUsd,
} from "@app/lib/api/programmatic_usage/daily_cap";
import {
  hasKeyReachedUsageCap,
  incrementRedisKeyUsageMicroUsd,
} from "@app/lib/api/programmatic_usage/key_cap";
import type { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { launchCreditAlertWorkflow } from "@app/temporal/credit_alerts/client";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const CREDIT_ALERT_THRESHOLD_PERCENT = 80;

export function isProgrammaticUsage(
  auth: Authenticator,
  { userMessageOrigin }: { userMessageOrigin: UserMessageOrigin }
): boolean {
  // TODO(PPUL): this is a temporary fix to allow zendesk to not be tracked as
  // programmatic usage, despite it relying on a custom API key. This should be
  // removed once we have a proper solution for zendesk.
  if (userMessageOrigin === "zendesk") {
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

export async function hasReachedProgrammaticUsageLimits(
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
): Promise<Result<void, Error>> {
  const isAdmin = auth.isAdmin();

  // First check workspace credits.
  const hasNoCredits = await hasReachedProgrammaticUsageLimits(auth);
  if (hasNoCredits) {
    const message = isAdmin
      ? "Your workspace has run out of programmatic usage credits. " +
        "Please purchase more credits in the Developers > Credits section of the Dust dashboard."
      : "Your workspace has run out of programmatic usage credits. " +
        "Please ask a Dust workspace admin to purchase more credits.";
    return new Err(new Error(message));
  }

  // Then check per-key cap.
  const keyCapReached = await hasKeyReachedUsageCap(auth);
  if (keyCapReached) {
    const message = isAdmin
      ? "This API key has reached its monthly usage cap. " +
        "Please increase the cap in the Developers > API Keys section of the Dust dashboard."
      : "This API key has reached its monthly usage cap. " +
        "Please ask a Dust workspace admin to increase the cap.";
    return new Err(new Error(message));
  }

  // Finally check daily cap.
  const dailyCapReached = await hasReachedDailyUsageCap(auth);
  if (dailyCapReached) {
    const message = isAdmin
      ? "Your workspace has reached its daily programmatic usage cap. " +
        "The cap will reset at midnight UTC, or you can increase it in admin settings."
      : "Your workspace has reached its daily programmatic usage cap. " +
        "Please contact your Dust workspace admin.";
    return new Err(new Error(message));
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
  }: {
    amountMicroUsd: number;
    userMessageOrigin: UserMessageOrigin;
  },
  parentLogger?: Logger
): Promise<{
  totalConsumedMicroUsd: number;
  totalInitialMicroUsd: number;
  activeCredits: CreditResource[];
}> {
  const localLogger = parentLogger ?? logger;
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
      statsDClient.increment("credits.consumption.blocked", 1, [
        `workspace_id:${workspace.sId}`,
        `origin:${userMessageOrigin}`,
      ]);
      statsDClient.increment("credits.consumption.excess", 1, [
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
      statsDClient.increment("credits.consumption.error", 1, [
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

  statsDClient.increment("credits.consumption.success", 1, [
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

  // Retrieve all runs for the given run ids.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });

  // Compute the token usage for each run.
  const runUsages = await concurrentExecutor(
    runs,
    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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

  const costWithMarkupMicroUsd = Math.ceil(
    runsCostMicroUsd * (1 + DUST_MARKUP_PERCENT / 100)
  );
  const { totalConsumedMicroUsd, totalInitialMicroUsd, activeCredits } =
    await decreaseProgrammaticCredits(
      auth,
      {
        amountMicroUsd: costWithMarkupMicroUsd,
        userMessageOrigin,
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
      statsDClient.increment("credits.consumption.alert", 1, [
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
