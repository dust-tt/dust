import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { QUEUE_NAME } from "./config";
import { invitationRemindersWorkflow } from "./workflows";

// 17:00 UTC = 09:00–10:00 San Francisco, 12:00–13:00 US East Coast, 18:00–19:00 Central Europe.
const CRON_SCHEDULE = "0 17 * * 1-5";

export async function launchInvitationRemindersWorkflow(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    await client.workflow.start(invitationRemindersWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: "invitation-reminders-workflow",
      cronSchedule: CRON_SCHEDULE,
    });
    logger.info("[Invitation Reminders] Launched workflow.");
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        "[Invitation Reminders] Workflow already running (idempotency check passed)."
      );
    } else {
      throw e;
    }
  }

  return new Ok(undefined);
}
