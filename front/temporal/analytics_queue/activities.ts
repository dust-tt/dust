import assert from "assert";

import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import { updateAnalyticsFeedback } from "@app/lib/analytics/feedback";
import { calculateTokenUsageCost } from "@app/lib/api/assistant/token_pricing";
import { ANALYTICS_ALIAS_NAME, getClient } from "@app/lib/api/elasticsearch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { AgentMessageType } from "@app/types";
import { normalizeError } from "@app/types";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { getAgentLoopData } from "@app/types/assistant/agent_run";
import type {
  AgentMessageAnalyticsData,
  AgentMessageAnalyticsFeedback,
  AgentMessageAnalyticsTokens,
  AgentMessageAnalyticsToolUsed,
} from "@app/types/assistant/analytics";

export async function storeAgentAnalyticsActivity(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const workspace = auth.getNonNullableWorkspace();

  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (runAgentDataRes.isErr()) {
    throw runAgentDataRes.error;
  }

  const {
    agentConfiguration,
    agentMessage,
    conversation,
    userMessage,
    agentMessageRow,
  } = runAgentDataRes.value;

  // Only index agent messages if there are no blocked actions awaiting approval.
  const hasBlockedActions = await checkForBlockedActions(auth, agentMessage);
  if (hasBlockedActions) {
    return;
  }

  // Collect token usage from run data.
  const tokens = await collectTokenUsage(auth, agentMessageRow);

  // Collect tool usage data from the agent message actions.
  const toolsUsed = await collectToolUsageFromMessage(auth, agentMessage);

  // Build the complete analytics document.
  const document: AgentMessageAnalyticsData = {
    agent_id: agentConfiguration.sId,
    agent_version: agentConfiguration.version.toString(),
    conversation_id: conversation.sId,
    latency_ms: agentMessageRow.modelInteractionDurationMs ?? 0,
    message_id: agentMessage.sId,
    status: agentMessage.status,
    // TODO(observability 21025-10-29): Use agentMessage.created timestamp to index documents
    timestamp: new Date(userMessage.created).toISOString(),
    tokens,
    tools_used: toolsUsed,
    user_id: userMessage.user?.sId ?? "unknown",
    workspace_id: workspace.sId,
    feedbacks: [],
  };

  await storeToElasticsearch(document);
}

/**
 * Check if the agent message has any blocked actions awaiting approval.
 */
async function checkForBlockedActions(
  auth: Authenticator,
  agentMessage: AgentMessageType
): Promise<boolean> {
  const blockedActions = await AgentMCPActionResource.listByAgentMessageIds(
    auth,
    [agentMessage.agentMessageId]
  );

  return blockedActions.some((action) =>
    isToolExecutionStatusBlocked(action.status)
  );
}

/**
 * Collect token usage from runs associated with this agent message.
 */
async function collectTokenUsage(
  auth: Authenticator,
  agentMessage: AgentMessage
): Promise<AgentMessageAnalyticsTokens> {
  if (!agentMessage.runIds || agentMessage.runIds.length === 0) {
    return {
      prompt: 0,
      completion: 0,
      reasoning: 0,
      cached: 0,
      cost_cents: 0,
    };
  }

  // Get run usages for all runs associated with this agent message.
  const runResources = await RunResource.listByDustRunIds(auth, {
    dustRunIds: agentMessage.runIds,
  });
  const runUsages = await concurrentExecutor(
    runResources,
    async (runResource) => runResource.listRunUsages(auth),
    { concurrency: 5 }
  );

  return runUsages.flat().reduce(
    (acc, usage) => {
      const usageCostUsd = calculateTokenUsageCost([usage]);
      // Use ceiling to ensure any non-zero cost is at least 1 cent.
      const usageCostCents =
        usageCostUsd > 0 ? Math.ceil(usageCostUsd * 100) : 0;

      return {
        prompt: acc.prompt + usage.promptTokens,
        completion: acc.completion + usage.completionTokens,
        reasoning: acc.reasoning, // No reasoning tokens in RunUsageType yet.
        cached: acc.cached + (usage.cachedTokens ?? 0),
        cost_cents: acc.cost_cents + usageCostCents,
      };
    },
    {
      prompt: 0,
      completion: 0,
      reasoning: 0,
      cached: 0,
      cost_cents: 0,
    }
  );
}

/**
 * Collect tool usage data from agent message actions.
 */
async function collectToolUsageFromMessage(
  auth: Authenticator,
  agentMessage: AgentMessageType
): Promise<AgentMessageAnalyticsToolUsed[]> {
  const res = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessage.agentMessageId,
  ]);

  return agentMessage.actions.map((action) => {
    // Look up the corresponding action resource to get more details.
    const actionResource = res.find(
      (r) =>
        r.agentMessageId === agentMessage.agentMessageId && r.id === action.id
    );

    assert(actionResource, "Action resource not found for action");

    return {
      step_index: action.step,
      server_name:
        action.internalMCPServerName ?? action.mcpServerId ?? "unknown",
      tool_name:
        action.functionCallName.split(TOOL_NAME_SEPARATOR).pop() ??
        action.functionCallName,
      execution_time_ms: actionResource.executionDurationMs,
      status: action.status,
    };
  });
}

/**
 * Store document directly to Elasticsearch.
 */
async function storeToElasticsearch(
  document: AgentMessageAnalyticsData
): Promise<void> {
  const esClient = await getClient();

  const documentId = `${document.workspace_id}_${document.message_id}_${document.timestamp}`;

  try {
    await esClient.index({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      body: document,
    });
  } catch (error) {
    logger.error(
      {
        documentId,
        error: normalizeError(error),
        index: ANALYTICS_ALIAS_NAME,
        messageId: document.message_id,
      },
      "Failed to index document in Elasticsearch"
    );

    throw error;
  }
}

export async function storeAgentMessageFeedbackActivity(
  authType: AuthenticatorType,
  {
    message,
  }: {
    message: AgentMessageRef;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  const workspace = auth.getNonNullableWorkspace();

  const agentMessageRow = await Message.findOne({
    where: {
      sId: message.agentMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!agentMessageRow?.agentMessage) {
    throw new Error(`Agent message not found: ${message.agentMessageId}`);
  }

  if (!agentMessageRow.parentId) {
    throw new Error(`Agent message has no parent: ${message.agentMessageId}`);
  }

  const agentMessageModel = agentMessageRow.agentMessage;

  const userMessageRow = await Message.findOne({
    where: {
      id: agentMessageRow.parentId,
      conversationId: agentMessageRow.conversationId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: true,
      },
    ],
  });

  if (!userMessageRow?.userMessage) {
    throw new Error(
      `User message not found for agent message: ${message.agentMessageId}`
    );
  }

  const agentMessageFeedbacks =
    await AgentMessageFeedbackResource.listByAgentMessageModelId(
      auth,
      agentMessageModel.id
    );

  const allFeedbacks: AgentMessageAnalyticsFeedback[] =
    agentMessageFeedbacks.map((agentMessageFeedback) => ({
      feedback_id: agentMessageFeedback.id,
      user_id: agentMessageFeedback.user?.sId ?? "unknown",
      thumb_direction: agentMessageFeedback.thumbDirection,
      dismissed: agentMessageFeedback.dismissed,
      is_conversation_shared: agentMessageFeedback.isConversationShared,
      created_at: agentMessageFeedback.createdAt.toISOString(),
    }));

  await updateAnalyticsFeedback(auth, {
    message: {
      sId: agentMessageRow.sId,
    },
    createdTimestamp: userMessageRow.createdAt.getTime(),
    feedbacks: allFeedbacks,
  });
}
