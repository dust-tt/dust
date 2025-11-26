import type { Authenticator } from "@app/lib/auth";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { WebhookTriggerType } from "@app/types/assistant/triggers";
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
    const activeSeats = await countActiveSeatsInWorkspaceCached(workspace.sId);
    const webhookLimit = Math.ceil(
      maxMessages * activeSeats * WORKSPACE_MESSAGE_LIMIT_MULTIPLIER
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
