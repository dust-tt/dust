import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/conversation_fork_queue/config";
import { makeConversationForkWorkflowId } from "@app/temporal/conversation_fork_queue/helpers";
import { conversationForkWorkflow } from "@app/temporal/conversation_fork_queue/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

export async function launchConversationForkWorkflow({
  workspaceId,
  sourceConversationId,
  destConversationId,
}: {
  workspaceId: string;
  sourceConversationId: string;
  destConversationId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeConversationForkWorkflowId({
    workspaceId,
    destConversationId,
  });

  try {
    await client.workflow.start(conversationForkWorkflow, {
      args: [{ workspaceId, sourceConversationId, destConversationId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        workspaceId,
        sourceConversationId,
        destConversationId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          workspaceId,
          sourceConversationId,
          destConversationId,
          error: e,
        },
        "Failed starting conversation fork workflow."
      );
    }

    return new Err(normalizeError(e));
  }
}
