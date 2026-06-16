import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import {
  storeAgentAnalyticsWorkflow,
  storeAgentMessageFeedbackWorkflow,
} from "@app/temporal/analytics_queue/workflows";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

// Resolves the agent configuration id backing an agent message (referenced by its
// message sId). Used to decide whether the feedback workflow needs to wait for
// Langfuse trace ingestion, which only applies to global agents.
async function getAgentConfigurationIdForAgentMessage(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
): Promise<string | null> {
  const messageRow = await MessageModel.findOne({
    attributes: ["id"],
    where: {
      sId: agentMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["agentConfigurationId"],
        required: true,
      },
    ],
  });

  return messageRow?.agentMessage?.agentConfigurationId ?? null;
}

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
      searchAttributes: {
        conversationId: [conversationId],
        workspaceId: [workspaceId],
      },
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

  // The startDelay exists only to let Langfuse ingest traces before the workflow
  // appends negative-feedback traces to the Langfuse dataset, which only happens for
  // global agents. For non-global agents the workflow merely updates the Elasticsearch
  // analytics document (no trace dependency), so we skip the delay to keep the feedback
  // chart/overview in sync without a multi-minute lag.
  const agentConfigurationId = await getAgentConfigurationIdForAgentMessage(
    auth,
    { agentMessageId }
  );
  const needsLangfuseTraceDelay =
    agentConfigurationId !== null && isGlobalAgentId(agentConfigurationId);

  try {
    await client.workflow.start(storeAgentMessageFeedbackWorkflow, {
      args: [authType, { message }],
      taskQueue: QUEUE_NAME,
      workflowId,
      startDelay: needsLangfuseTraceDelay ? "2 minutes" : undefined,
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
