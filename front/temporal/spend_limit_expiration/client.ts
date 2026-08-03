import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/spend_limit_expiration/config";
import { expirePoolCapOverridesWorkflow } from "@app/temporal/spend_limit_expiration/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

export const SPEND_LIMIT_EXPIRATION_SCHEDULE_ID =
  "spend-limit-expiration-schedule";

export async function createOrUpdateSpendLimitExpirationSchedule(): Promise<
  Result<void, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = SPEND_LIMIT_EXPIRATION_SCHEDULE_ID;
  const scheduleOptions = {
    action: {
      type: "startWorkflow" as const,
      workflowType: expirePoolCapOverridesWorkflow,
      args: [],
      taskQueue: QUEUE_NAME,
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.BUFFER_ONE,
    },
    spec: {
      // Every hour at minute 0 — bounds how long an expired override can
      // linger before being reverted.
      cronExpressions: ["0 * * * *"] as string[],
      timezone: "UTC",
    },
  } as const;

  const existingSchedule = client.schedule.getHandle(scheduleId);
  try {
    await existingSchedule.update((previous) => {
      return {
        ...scheduleOptions,
        state: previous.state,
      };
    });

    logger.info("Updated existing spend limit expiration schedule.");
    return new Ok(undefined);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      logger.error(
        { err },
        "Failed to update existing spend limit expiration schedule."
      );
      return new Err(normalizeError(err));
    }
  }

  try {
    await client.schedule.create(scheduleOptions);
    logger.info("Created new spend limit expiration schedule.");
    return new Ok(undefined);
  } catch (error) {
    logger.error(
      { error },
      "Failed to create new spend limit expiration schedule."
    );
    return new Err(normalizeError(error));
  }
}
