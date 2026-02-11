import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { getPurgeRunExecutionsScheduleId } from "@app/temporal/hard_delete/utils";
import { purgeRunExecutionsCronWorkflow } from "@app/temporal/hard_delete/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { QUEUE_NAME } from "./config";

/**
 * This function starts a schedule to purge expired run executions.
 */
export async function launchPurgeRunExecutionsSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = getPurgeRunExecutionsScheduleId();

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: purgeRunExecutionsCronWorkflow,
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
      logger.error({}, "Failed to start purge run executions.");

      return new Err(normalizeError(err));
    }
  }

  return new Ok(undefined);
}
