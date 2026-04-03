import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/project_todo/config";
import {
  mergeRequestSignal,
  todoCompleteSignal,
  todoRefreshSignal,
} from "@app/temporal/project_todo/signals";
import {
  projectMergeWorkflow,
  projectTodoWorkflow,
} from "@app/temporal/project_todo/workflows";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function makeProjectTodoWorkflowId(
  workspaceId: string,
  conversationId: string
): string {
  return `conversation-todo-${workspaceId}-${conversationId}`;
}

function makeProjectMergeWorkflowId(
  workspaceId: string,
  spaceId: string
): string {
  return `project-merge-todo-${workspaceId}-${spaceId}`;
}

export async function launchOrSignalProjectTodoWorkflow({
  authType,
  conversationId,
  messageId,
  spaceId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
  spaceId: string;
}): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeProjectTodoWorkflowId(
    authType.workspaceId,
    conversationId
  );

  try {
    await client.workflow.signalWithStart(projectTodoWorkflow, {
      args: [{ authType, conversationId, messageId, spaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: todoRefreshSignal,
      signalArgs: [messageId],
      workflowExecutionTimeout: "1 hour",
      memo: {
        workspaceId: authType.workspaceId,
        conversationId,
        messageId,
        spaceId,
      },
    });
  } catch (e) {
    // Swallow errors — todo workflow failures must not block conversation flow.
    logger.error(
      {
        workflowId,
        workspaceId: authType.workspaceId,
        conversationId,
        messageId,
        spaceId,
        error: normalizeError(e),
      },
      "Failed starting conversation todo workflow"
    );
  }
}

export async function signalProjectTodoComplete({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  try {
    const client = await getTemporalClientForFrontNamespace();
    const workflowId = makeProjectTodoWorkflowId(
      authType.workspaceId,
      conversationId
    );
    await client.workflow
      .getHandle(workflowId)
      .signal(todoCompleteSignal, messageId);
  } catch (e) {
    // Swallow errors — workflow may have already completed or timed out.
    logger.warn(
      {
        conversationId,
        error: normalizeError(e),
      },
      "Failed signaling conversation todo complete (workflow may have already finished)"
    );
  }
}

// Called from signalOrStartMergeWorkflowActivity to fan-in signals from per-conversation
// workflows into the single per-project merge workflow. Uses signalWithStart so the merge
// workflow is automatically created if not already running.
export async function signalOrStartProjectMergeWorkflow({
  authType,
  spaceId,
}: {
  authType: AuthenticatorType;
  spaceId: string;
}): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeProjectMergeWorkflowId(authType.workspaceId, spaceId);

  try {
    await client.workflow.signalWithStart(projectMergeWorkflow, {
      args: [{ authType, spaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: mergeRequestSignal,
      signalArgs: [],
      workflowExecutionTimeout: "7 days",
      memo: {
        workspaceId: authType.workspaceId,
        spaceId,
      },
    });
  } catch (e) {
    // Swallow errors — merge workflow failures must not block the analysis workflow.
    logger.error(
      {
        workflowId,
        workspaceId: authType.workspaceId,
        spaceId,
        error: normalizeError(e),
      },
      "Failed signaling project merge workflow"
    );
  }
}
