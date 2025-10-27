import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { AgentMessageAnalyticsArgs } from "@app/temporal/agent_loop/activities/analytics";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import {
  storeAgentAnalyticsWorkflow,
  storeAgentMessageFeedbackWorkflow,
} from "@app/temporal/analytics_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function launchStoreAgentAnalyticsWorkflow({
  authType,
  agentMessageAnalyticsArgs,
}: {
  authType: AuthenticatorType;
  agentMessageAnalyticsArgs: AgentMessageAnalyticsArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;

  const { agentMessageId, conversationId } = agentMessageAnalyticsArgs.message;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeAgentMessageAnalyticsWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  try {
    if (agentMessageAnalyticsArgs.type === "agent_message") {
      await client.workflow.start(storeAgentAnalyticsWorkflow, {
        args: [authType, { agentLoopArgs: agentMessageAnalyticsArgs.message }],
        taskQueue: QUEUE_NAME,
        workflowId,
        memo: {
          agentMessageId,
          workspaceId,
        },
      });
    } else if (agentMessageAnalyticsArgs.type === "agent_message_feedback") {
      await client.workflow.start(storeAgentMessageFeedbackWorkflow, {
        args: [
          authType,
          {
            feedback: agentMessageAnalyticsArgs.feedback,
            message: agentMessageAnalyticsArgs.message,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId,
        memo: {
          agentMessageId,
          workspaceId,
        },
      });
    }

    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          agentMessageId: agentMessageAnalyticsArgs.message.agentMessageId,
          error: e,
        },
        "Failed starting agent analytics workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}
