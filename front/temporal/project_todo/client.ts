import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/project_todo/config";
import {
  todoCompleteSignal,
  todoRefreshSignal,
} from "@app/temporal/project_todo/signals";
import { projectTodoWorkflow } from "@app/temporal/project_todo/workflows";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function makeProjectTodoWorkflowId(
  workspaceId: string,
  conversationId: string
): string {
  return `conversation-todo-${workspaceId}-${conversationId}`;
}

export async function launchOrSignalProjectTodoWorkflow({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeProjectTodoWorkflowId(
    authType.workspaceId,
    conversationId
  );

  try {
    await client.workflow.signalWithStart(projectTodoWorkflow, {
      args: [{ authType, conversationId, messageId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: todoRefreshSignal,
      signalArgs: [messageId],
      workflowExecutionTimeout: "1 hour",
      memo: {
        workspaceId: authType.workspaceId,
        conversationId,
        messageId,
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
