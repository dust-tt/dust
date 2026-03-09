import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { getHardDeleteScheduleId } from "@app/temporal/hard_delete/utils";
import { hardDeleteCronWorkflow } from "@app/temporal/hard_delete/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { QUEUE_NAME } from "./config";

/**
 * This function starts the hard delete schedule.
 */
export async function launchHardDeleteSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = getHardDeleteScheduleId();

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: hardDeleteCronWorkflow,
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
      logger.error({}, "Failed to start hard delete schedule.");

      return new Err(normalizeError(err));
    }
  }

  return new Ok(undefined);
}
