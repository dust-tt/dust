import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/usage_queue/config";
import { updateWorkspaceUsageWorkflow } from "@app/temporal/usage_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

async function shouldProcessUsageUpdate(workflowId: string) {
  // Compute the max usage of the workspace once per hour.
  const remainingRunsThisHour = await rateLimiter({
    key: workflowId,
    maxPerTimeframe: 1,
    timeframeSeconds: 60 * 60, // 1 hour.
    logger: logger,
  });

  return remainingRunsThisHour > 0;
}

/**
 * This function starts a workflow to compute the maximum usage of a workspace once per hour per workspace.
 */
export async function launchUpdateUsageWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const workflowId = `workflow-usage-queue-${workspaceId}`;

  const shouldProcess = await shouldProcessUsageUpdate(workflowId);
  if (!shouldProcess) {
    return new Ok(undefined);
  }

  const client = await getTemporalClient();

  try {
    await client.workflow.start(updateWorkspaceUsageWorkflow, {
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
      "Started usage workflow."
    );

    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          error: e,
        },
        "Failed starting usage workflow."
      );
    }
    return new Err(normalizeError(e));
  }
}
