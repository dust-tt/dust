import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { isUserMessageOrigin } from "@app/components/agent_builder/observability/utils";
import type { AuthenticatorType } from "@app/lib/auth";
import { shouldSendNotificationForAgentAnswer } from "@app/lib/notifications/workflows/conversation-unread";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/notifications_queue/config";
import { makeConversationUnreadNotificationWorkflowId } from "@app/temporal/notifications_queue/helpers";
import { sendUnreadConversationNotificationWorkflow } from "@app/temporal/notifications_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function launchConversationUnreadNotificationWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const { agentMessageId, conversationId } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeConversationUnreadNotificationWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  if (!isUserMessageOrigin(agentLoopArgs.userMessageOrigin)) {
    logger.info(
      { userMessageOrigin: agentLoopArgs.userMessageOrigin },
      "User message origin is not a valid origin."
    );
    return new Ok(undefined);
  }

  // Check if the user message origin is valid for sending notifications.
  if (!shouldSendNotificationForAgentAnswer(agentLoopArgs.userMessageOrigin)) {
    return new Ok(undefined);
  }

  try {
    await client.workflow.start(sendUnreadConversationNotificationWorkflow, {
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
        "Failed starting conversation unread notification workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}
