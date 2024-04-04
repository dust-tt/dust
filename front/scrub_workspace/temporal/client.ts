import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { scheduleWorkspaceScrubWorkflowV2 } from "@app/scrub_workspace/temporal/workflows";

import { QUEUE_NAME } from "./config";

export async function launchScheduleWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `schedule-workspace-scrub-${workspaceId}`;

  try {
    await client.workflow.start(scheduleWorkspaceScrubWorkflowV2, {
      args: [{ workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workspaceId,
      },
    });
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}
