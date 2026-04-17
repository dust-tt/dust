import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/project_todo/config";
import { projectTodoWorkflow } from "@app/temporal/project_todo/workflows";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";

function makeProjectTodoWorkflowId(
  workspaceId: string,
  spaceId: string
): string {
  return `project-todo-${workspaceId}-${spaceId}`;
}

export async function launchOrSignalProjectTodoWorkflow({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeProjectTodoWorkflowId(workspaceId, spaceId);
  const spaceModelId = getResourceIdFromSId(spaceId);
  if (!spaceModelId) {
    logger.warn(
      { workspaceId, spaceId },
      "Skipping project todo workflow start for invalid space ID"
    );
    return;
  }
  const scheduleOffsetMinutes = spaceModelId % 60;
  // Spread merges across the hour: one run per workspace project at this minute every hour (UTC).
  const cronSchedule = `${scheduleOffsetMinutes} * * * *`;

  try {
    await client.workflow.start(projectTodoWorkflow, {
      args: [{ workspaceId, spaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      cronSchedule,
      memo: {
        workspaceId,
        spaceId,
        scheduleOffsetMinutes,
      },
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      // Swallow errors — todo workflow failures must not block request flow.
      logger.error(
        {
          workflowId,
          workspaceId,
          spaceId,
          error: normalizeError(e),
        },
        "Failed starting project todo workflow"
      );
    }
  }
}

export async function stopProjectTodoWorkflow({
  workspaceId,
  spaceId,
  stopReason = "project archived",
}: {
  workspaceId: string;
  spaceId: string;
  stopReason?: string;
}): Promise<void> {
  try {
    const client = await getTemporalClientForFrontNamespace();
    const workflowId = makeProjectTodoWorkflowId(workspaceId, spaceId);
    await client.workflow.getHandle(workflowId).terminate(stopReason);
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      // Swallow errors — workflow may have already been terminated.
      logger.warn(
        {
          spaceId,
          error: normalizeError(e),
        },
        "Failed terminating project todo workflow"
      );
    }
  }
}
