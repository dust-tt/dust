import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { QUEUE_NAME } from "./config";
import { invitationRemindersWorkflow } from "./workflows";

// 17:00 UTC = 09:00 San Francisco, 13:00 US East Coast, 19:00 Central Europe.
const SCHEDULE_ID = "invitation-reminders-schedule";
const CRON_EXPRESSION = "0 17 * * 1-5";

export async function launchInvitationRemindersWorkflow(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    await client.schedule.create({
      scheduleId: SCHEDULE_ID,
      action: {
        type: "startWorkflow",
        workflowType: invitationRemindersWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        cronExpressions: [CRON_EXPRESSION],
      },
    });
    logger.info("[Invitation Reminders] Schedule created.");
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) {
      logger.error({}, "[Invitation Reminders] Failed to create schedule.");
      return new Err(normalizeError(err));
    }
  }

  return new Ok(undefined);
}
