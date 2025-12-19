import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { isUserMessageOrigin } from "@app/components/agent_builder/observability/utils";
import type {AuthenticatorType} from "@app/lib/auth";
import {
  Authenticator,
  getFeatureFlags
} from "@app/lib/auth";
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

  // Construct back an authenticator from the auth type.
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.error(
      { authType, error: authResult.error },
      "Failed to construct authenticator from auth type"
    );
    return new Ok(undefined);
  }

  const auth = authResult.value;
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

  // Check if the workspace has notifications enabled.
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (!featureFlags.includes("notifications")) {
    return new Ok(undefined);
  }

  try {
    await client.workflow.start(sendUnreadConversationNotificationWorkflow, {
      args: [auth, { agentLoopArgs }],
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
