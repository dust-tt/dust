import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/mentions_queue/config";
import {
  makeDocumentCommentMentionWorkflowId,
  makeMentionsWorkflowId,
} from "@app/temporal/mentions_queue/helpers";
import {
  documentCommentMentionWorkflow,
  handleMentionsWorkflow,
} from "@app/temporal/mentions_queue/workflows";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdReusePolicy,
} from "@temporalio/client";

export async function launchHandleMentionsWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const { agentMessageId, conversationId } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeMentionsWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  try {
    await client.workflow.start(handleMentionsWorkflow, {
      args: [authType, { agentLoopArgs }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        agentMessageId,
        workspaceId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          agentMessageId,
          error: e,
        },
        "Failed starting mentions workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}

export async function launchDocumentCommentMentionWorkflow({
  authType,
  documentPath,
  newMessage,
}: {
  authType: AuthenticatorType;
  documentPath: string;
  newMessage: NewCommentMessage;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const workflowId = makeDocumentCommentMentionWorkflowId({
    workspaceId,
    documentPath,
    newMessage,
  });

  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.start(documentCommentMentionWorkflow, {
      args: [authType, { documentPath, newMessage }],
      taskQueue: QUEUE_NAME,
      workflowId,
      // A message brought again by a concurrent or later save is not posted again.
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      memo: {
        workspaceId,
        documentPath,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      return new Ok(undefined);
    }
    return new Err(normalizeError(e));
  }
}
