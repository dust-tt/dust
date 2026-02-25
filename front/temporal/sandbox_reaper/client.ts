import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME, SCHEDULE_ID } from "@app/temporal/sandbox_reaper/config";
import { sandboxReaperWorkflow } from "@app/temporal/sandbox_reaper/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

export async function launchSandboxReaperSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: sandboxReaperWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      scheduleId: SCHEDULE_ID,
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        intervals: [{ every: "5m" }],
      },
    });
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) {
      logger.error({}, "Failed to start sandbox reaper schedule.");

      return new Err(normalizeError(err));
    }
  }

  return new Ok(undefined);
}
