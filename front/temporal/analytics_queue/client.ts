import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import { storeAgentAnalyticsWorkflow } from "@app/temporal/analytics_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function launchStoreAgentAnalyticsWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const { agentMessageId, conversationId } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeAgentMessageAnalyticsWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  try {
    await client.workflow.start(storeAgentAnalyticsWorkflow, {
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
          agentMessageId: agentLoopArgs.agentMessageId,
          error: e,
        },
        "Failed starting agent analytics workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}
