import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { getPurgeDataRetentionScheduleId } from "@app/temporal/data_retention/utils";
import { purgeDataRetentionWorkflow } from "@app/temporal/data_retention/workflows";

import { QUEUE_NAME } from "./config";

/**
 * This function starts a schedule to purge workspaces set up with retention policy (only concern conversations at the moment).
 */
export async function launchPurgeDataRetentionSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClient();
  const scheduleId = getPurgeDataRetentionScheduleId();

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: purgeDataRetentionWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      scheduleId,
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        intervals: [{ every: "24h" }],
      },
    });
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) {
      logger.error({}, "Failed to start purge data retention schedule.");

      return new Err(err as Error);
    }
  }

  return new Ok(undefined);
}
