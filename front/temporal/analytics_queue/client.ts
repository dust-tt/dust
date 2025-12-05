import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import {
  storeAgentAnalyticsWorkflow,
  storeAgentMessageFeedbackWorkflow,
} from "@app/temporal/analytics_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";

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
          agentMessageId,
          error: e,
        },
        "Failed starting agent analytics workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}

export async function launchAgentMessageFeedbackWorkflow(
  auth: Authenticator,
  {
    message,
  }: {
    message: AgentMessageRef;
  }
): Promise<Result<undefined, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const authType = auth.toJSON();

  const { conversationId, agentMessageId } = message;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId =
    makeAgentMessageAnalyticsWorkflowId({
      conversationId,
      agentMessageId,
      workspaceId,
    }) + "-feedback";

  try {
    await client.workflow.start(storeAgentMessageFeedbackWorkflow, {
      args: [authType, { message }],
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
        "Failed starting agent message feedback workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}
