import type { Authenticator } from "@app/lib/auth";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

const DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT = 256; // Default to 256 executions per day

export const checkTriggerForExecutionPerDayLimit = async (
  auth: Authenticator,
  {
    trigger,
  }: {
    trigger: TriggerType;
  }
) => {
  const maxMessages =
    trigger.executionPerDayLimitOverride ??
    DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT;

  if (maxMessages !== -1) {
    const workspace = auth.getNonNullableWorkspace();
    const remaining = await rateLimiter({
      key: `workspace:${workspace.sId}:trigger:${trigger.sId}:day`,
      maxPerTimeframe: maxMessages,
      timeframeSeconds: getTimeframeSecondsFromLiteral("day"),
      logger: logger,
    });

    if (remaining <= 0) {
      return new Err({
        name: "dust_error",
        code: "rate_limit_error",
        message: `This trigger ${trigger.name} (${trigger.sId}) has reached its execution per day limit of ${maxMessages} executions, please contact support to increase the limit.`,
      });
    }
    return new Ok(undefined);
  } else {
    return new Ok(undefined);
  }
};
