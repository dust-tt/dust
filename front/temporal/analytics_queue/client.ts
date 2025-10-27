import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { AgentUsageAnalyticsArgs } from "@app/temporal/agent_loop/activities/analytics";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import { storeAgentAnalyticsWorkflow, storeAgentMessageFeedbackWorkflow } from "@app/temporal/analytics_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function launchStoreAgentAnalyticsWorkflow({
  authType,
  agentUsageAnalyticsArgs,
}: {
  authType: AuthenticatorType;
  agentUsageAnalyticsArgs: AgentUsageAnalyticsArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;

  const { agentMessageId, conversationId } = agentUsageAnalyticsArgs.content;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeAgentMessageAnalyticsWorkflowId({
    agentMessageId: agentMessageId.toString(),
    conversationId,
    workspaceId,
  });

  try {
    if (agentUsageAnalyticsArgs.type === "agent_message") {
      await client.workflow.start(storeAgentAnalyticsWorkflow, {
        args: [authType, { agentLoopArgs: agentUsageAnalyticsArgs.content }],
        taskQueue: QUEUE_NAME,
        workflowId,
        memo: {
          agentMessageId,
          workspaceId,
        },
      });
    } else if (agentUsageAnalyticsArgs.type === "agent_message_feedback") {
      await client.workflow.start(storeAgentMessageFeedbackWorkflow, {
        args: [authType, { feedback: agentUsageAnalyticsArgs.content }],
        taskQueue: QUEUE_NAME,
        workflowId,
      });
    }

    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          agentMessageId: agentUsageAnalyticsArgs.content.agentMessageId,
          error: e,
        },
        "Failed starting agent analytics workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}

export async function launchStoreAgentMessageFeedbackWorkflow({
  authType,
  feedback,
}: {
  authType: AuthenticatorType;
  feedback: AgentMessageFeedbackType;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const { workspaceId } = authType;
  const { agentMessageId } = feedback;

  const workflowId = `agent-message-feedback-${workspaceId}-${agentMessageId}`;

  try {
    await client.workflow.start(storeAgentMessageFeedbackWorkflow, {
      args: [authType, { feedback }],
      taskQueue: QUEUE_NAME,
      workflowId,
    });

    return new Ok(undefined);
  } catch (e) {
    return new Err(normalizeError(e));
  }
}
