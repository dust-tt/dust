import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const WORKSPACE_MESSAGE_LIMIT_MULTIPLIER = 0.1; // 10% of workspace message limit

export const checkWebhookRequestForRateLimit = async (
  auth: Authenticator
): Promise<
  Result<
    void,
    Omit<DustError, "code"> & {
      code: "rate_limit_error";
    }
  >
> => {
  const plan = auth.getNonNullablePlan();
  const workspace = auth.getNonNullableWorkspace();
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  // Rate limiting: 10% of workspace message limit
  if (maxMessages !== -1) {
    const activeSeats = await countActiveSeatsInWorkspaceCached(workspace.sId);
    const webhookLimit = Math.ceil(
      maxMessages * activeSeats * WORKSPACE_MESSAGE_LIMIT_MULTIPLIER
    ); // 10% of workspace message limit

    const remaining = await rateLimiter({
      key: `workspace:${workspace.sId}:webhook_triggers:${maxMessagesTimeframe}`,
      maxPerTimeframe: webhookLimit,
      timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
      logger: logger,
    });

    if (remaining <= 0) {
      return new Err({
        name: "dust_error",
        code: "rate_limit_error",
        message: `Webhook triggers rate limit exceeded. You can trigger up to ${webhookLimit} webhooks per ${maxMessagesTimeframe}.`,
      });
    }
    return new Ok(undefined);
  } else {
    return new Ok(undefined);
  }
};
