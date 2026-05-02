import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/project_todo/config";
import { todoRefreshSignal } from "@app/temporal/project_todo/signals";
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
  // Durable loop inside the workflow: same UTC minute each hour (see workflows.ts).
  try {
    await client.workflow.start(projectTodoWorkflow, {
      args: [{ workspaceId, spaceId, scheduleOffsetMinutes }],
      taskQueue: QUEUE_NAME,
      workflowId,
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

/**
 * Request an on-demand project todo run without starting a second workflow: signals the single
 * durable workflow for this project (starts it with signalWithStart if not running).
 */
export async function startImmediateProjectTodoWorkflowOnce({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  const spaceModelId = getResourceIdFromSId(spaceId);
  if (!spaceModelId) {
    logger.warn(
      { workspaceId, spaceId },
      "Skipping project todo refresh signal: invalid space ID"
    );
    return;
  }

  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeProjectTodoWorkflowId(workspaceId, spaceId);
  const scheduleOffsetMinutes = spaceModelId % 60;

  try {
    await client.workflow.signalWithStart(projectTodoWorkflow, {
      args: [{ workspaceId, spaceId, scheduleOffsetMinutes }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: todoRefreshSignal,
      signalArgs: ["refresh"],
    });
  } catch (e) {
    logger.error(
      {
        workflowId,
        workspaceId,
        spaceId,
        error: normalizeError(e),
      },
      "Failed signalWithStart for project todo refresh"
    );
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
