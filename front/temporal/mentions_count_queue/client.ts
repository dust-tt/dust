import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { QUEUE_NAME } from "./config";
import { mentionsCountWorkflow } from "./workflows";

export async function launchMentionsCountWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = `mentions-count-queue-${workspaceId}`;

  try {
    // if workflow is already running, no need to update mention count again
    const handle = client.workflow.getHandle(workflowId);
    try {
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
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
      // workflow not found, continue
    }

    await client.workflow.start(mentionsCountWorkflow, {
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
    return new Err(normalizeError(e));
  }
}
