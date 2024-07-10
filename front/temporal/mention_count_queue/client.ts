import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import { QUEUE_NAME } from "./config";
import { mentionCountWorkflow } from "./workflows";

export async function launchMentionCountWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `mention-count-queue-${workspaceId}`;

  try {
    // if workflow is already running, no need to update mention count again
    const handle = client.workflow.getHandle(workflowId);
    const workflowExecution = await handle.describe();
    if (workflowExecution.status.name === "RUNNING") {
      logger.info(
        {
          workspaceId,
          workflowId,
        },
        "Workflow already running."
      );
      return new Ok(workflowId);
    }

    await client.workflow.start(mentionCountWorkflow, {
      args: [workspaceId],
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
      "Started workflow."
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed starting workflow."
    );
    return new Err(e as Error);
  }
}
