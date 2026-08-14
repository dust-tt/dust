import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import {
  makeAgentMessageAnalyticsWorkflowId,
  makeConsumptionExportWorkflowId,
} from "@app/temporal/analytics_queue/helpers";
import { storeAgentMessageConsumptionAttributionV3Signal } from "@app/temporal/analytics_queue/signals";
import {
  runConsumptionExportWorkflow,
  storeAgentAnalyticsWorkflow,
  storeAgentMessageConsumptionAttributionV3Workflow,
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

export async function launchStoreAgentMessageConsumptionAttributionWorkflow({
  authType,
  message,
}: {
  authType: AuthenticatorType;
  message: AgentMessageRef;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;

  const { agentMessageId, conversationId } = message;
  const messageRef = { agentMessageId, conversationId };

  const client = await getTemporalClientForFrontNamespace();

  const workflowId =
    makeAgentMessageAnalyticsWorkflowId({
      agentMessageId,
      conversationId,
      workspaceId,
    }) + "-consumption-attribution-v3";

  try {
    // signalWithStart, not start: a message settles across several finalizes (pause for approval,
    // resume, retries) and each must recompute. start would drop every pass after the first as
    // already-started, freezing a tool that was still blocked when the first pass ran. The signal
    // instead reruns a workflow already in flight and starts one otherwise.
    await client.workflow.signalWithStart(
      storeAgentMessageConsumptionAttributionV3Workflow,
      {
        args: [authType, { message: messageRef }],
        taskQueue: QUEUE_NAME,
        workflowId,
        signal: storeAgentMessageConsumptionAttributionV3Signal,
        signalArgs: undefined,
        searchAttributes: {
          conversationId: [conversationId],
          workspaceId: [workspaceId],
        },
        memo: {
          agentMessageId,
          workspaceId,
        },
      }
    );
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        agentMessageId,
        error: e,
      },
      "Failed starting agent message consumption attribution workflow"
    );

    return new Err(normalizeError(e));
  }
}

// Workflow ID is unique per worksapce meaning a duplicate call while a previous
// export is still running fails
export async function launchConsumptionExportWorkflow(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter: ConsumptionScopeFilter;
  }
): Promise<Result<undefined, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const authType = auth.toJSON();

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeConsumptionExportWorkflowId({ workspaceId });

  try {
    await client.workflow.start(runConsumptionExportWorkflow, {
      args: [authType, { period, filter }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        workspaceId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      return new Ok(undefined);
    }

    logger.error(
      {
        workflowId,
        workspaceId,
        error: e,
      },
      "Failed starting consumption export workflow"
    );

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
