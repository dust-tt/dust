import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/mentions_queue/config";
import { makeMentionsWorkflowId } from "@app/temporal/mentions_queue/helpers";
import { handleMentionsWorkflow } from "@app/temporal/mentions_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

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
