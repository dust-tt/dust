import {
  isCreditPricedWorkspace,
  isProgrammaticApiBlocked,
} from "@app/lib/api/credits/access_control";
import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import type { Authenticator } from "@app/lib/auth";
import { computeEffectiveMessageLimit } from "@app/lib/plans/usage/limits";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  TriggerType,
  WebhookTriggerType,
} from "@app/types/assistant/triggers";
import { DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT } from "@app/types/assistant/triggers";

const WORKSPACE_MESSAGE_LIMIT_MULTIPLIER = 0.5; // 50% of workspace message limit

export type RateLimitCheckResult =
  | { rateLimited: false; message?: undefined }
  | { rateLimited: true; message: string };

export async function checkWebhookRequestForRateLimit(
  auth: Authenticator
): Promise<RateLimitCheckResult> {
  const plan = auth.getNonNullablePlan();
  const workspace = auth.getNonNullableWorkspace();
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  if (maxMessages !== -1) {
    const activeSeats = await countActiveSeatsForWorkspace(workspace.sId);
    const effectiveMaxMessages = computeEffectiveMessageLimit({
      planCode: plan.code,
      maxMessages,
      activeSeats,
    });
    const webhookLimit = Math.ceil(
      effectiveMaxMessages * WORKSPACE_MESSAGE_LIMIT_MULTIPLIER
    );

    const remaining = await rateLimiter({
      key: `workspace:${workspace.sId}:webhook_triggers:${maxMessagesTimeframe}`,
      maxPerTimeframe: webhookLimit,
      timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
      logger,
    });

    if (remaining <= 0) {
      return {
        rateLimited: true,
        message:
          "Webhook triggers rate limit exceeded. " +
          `You can trigger up to ${webhookLimit} webhooks per ` +
          (maxMessagesTimeframe === "day" ? "day" : "month"),
      };
    }
  }

  return { rateLimited: false };
}

export async function checkTriggerForExecutionPerDayLimit(
  auth: Authenticator,
  {
    trigger,
  }: {
    trigger: WebhookTriggerType;
  }
): Promise<RateLimitCheckResult> {
  const maxMessages =
    trigger.executionPerDayLimitOverride ??
    DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT;

  if (maxMessages !== -1) {
    const workspace = auth.getNonNullableWorkspace();
    const remaining = await rateLimiter({
      key: `workspace:${workspace.sId}:trigger:${trigger.sId}:day`,
      maxPerTimeframe: maxMessages,
      timeframeSeconds: getTimeframeSecondsFromLiteral("day"),
      logger,
    });

    if (remaining <= 0) {
      return {
        rateLimited: true,
        message: `This trigger ${trigger.name} (${trigger.sId}) has reached its execution per day limit of ${maxMessages} executions, please contact support to increase the limit.`,
      };
    }
  }

  return { rateLimited: false };
}

// Whether a trigger charged to the workspace pool is blocked by the credit-priced
// programmatic monthly cap. Reads the same state as `checkMessagesLimit`, so callers
// can reject early instead of letting the run fail (and be retried) downstream.
export async function isTriggerProgrammaticCapReached(
  auth: Authenticator,
  { trigger }: { trigger: Pick<TriggerType, "executionMode"> }
): Promise<boolean> {
  if (
    trigger.executionMode !== "workspace_pool" ||
    !isCreditPricedWorkspace(auth)
  ) {
    return false;
  }

  return isProgrammaticApiBlocked(auth);
}
