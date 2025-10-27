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
} from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { AgentMessageType, LightAgentConfigurationType } from "@app/types";
import { normalizeError } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
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

  logger.info({ tokens }, "Tokens");

  // Collect tool usage data from the agent message actions.
  const toolsUsed = await collectToolUsageFromMessage(auth, agentMessage);

  logger.info({ toolsUsed }, "Tools used");

  // Build the complete analytics document.
  const document: AgentMessageAnalyticsData = {
    agent_id: agentConfiguration.sId,
    agent_version: agentConfiguration.version.toString(),
    conversation_id: conversation.sId,
    // TODO(observability 21025-10-20): Add support for latency once defined.
    latency_ms: 0,
    message_id: agentMessage.sId,
    status: agentMessage.status,
    timestamp: new Date(Math.floor(agentMessage.created / 1000) * 1000).toISOString(),
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

  logger.info({ runResources }, "Run resources");
  logger.info({ runUsages }, "Run usages");

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

    // TODO:(observability) This is not accurate as the action is created before tool validation
    // is required. Meaning it accounts for the delay of user's validation time.
    const executionTimeMs =
      actionResource?.updatedAt.getTime() - actionResource?.createdAt.getTime();

    return {
      step_index: action.step,
      server_name:
        action.internalMCPServerName ?? action.mcpServerId ?? "unknown",
      tool_name:
        action.functionCallName.split(TOOL_NAME_SEPARATOR).pop() ??
        action.functionCallName,
      execution_time_ms: executionTimeMs,
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

async function fetchMessageByAgentMessageId(
  auth: Authenticator,
  agentMessageId: string,
  conversationSId: string
): Promise<AgentMessageType | null> {
  // First, get the conversation resource to get the numeric ID from the sId
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationSId
  );

  if (!conversation) {
    return null;
  }

  const message = await Message.findOne({
    where: {
      sId: agentMessageId,
      conversationId: conversation.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!message?.agentMessage) {
    return null;
  }

  return {
    sId: message.sId,
    type: "agent_message" as const,
    version: message.version,
    rank: message.rank,
    created: Math.floor(new Date(message.agentMessage.createdAt).getTime() / 1000) * 1000,
    completedTs: message.agentMessage.completedAt?.getTime() ?? null,
    parentMessageId: message.parentId?.toString() ?? null,
    parentAgentMessageId: null,
    status: "succeeded" as const,
    content: null,
    chainOfThought: null,
    error: null,
    id: message.agentMessage.id,
    agentMessageId: message.agentMessage.id,
    visibility: message.visibility,
    configuration: {} as unknown as LightAgentConfigurationType,
    skipToolsValidation: message.agentMessage.skipToolsValidation,
    actions: [],
    rawContents: [],
    contents: [],
    parsedContents: {},
  } satisfies AgentMessageType;
}

export async function storeAgentMessageFeedbackActivity(
  authType: AuthenticatorType,
  {
    message,
    feedback,
  }: {
    message: {
      agentMessageId: string;
      conversationId: string;
    };
    feedback: AgentMessageAnalyticsFeedback;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  const agentMessage = await fetchMessageByAgentMessageId(
    auth,
    message.agentMessageId,
    message.conversationId
  );

  if (!agentMessage) {
    throw new Error(`Message not found for agentMessageId: ${message.agentMessageId}`);
  }

  // Find the agent message by ID to get the numeric ID
  const agentMessageRecord = await AgentMessage.findOne({
    where: {
      id: agentMessage.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (!agentMessageRecord) {
    throw new Error(`Agent message record not found for agentMessageId: ${message.agentMessageId}`);
  }

  // Fetch all existing feedbacks for this agent message
  const existingFeedbacks = await AgentMessageFeedbackResource.listByAgentMessageId(
    auth,
    agentMessageRecord.id
  );

  // Convert existing feedbacks to analytics format
  const existingAnalyticsFeedbacks = existingFeedbacks
    .filter((existingFeedback) => existingFeedback.id !== feedback.feedback_id).map((existingFeedback) => ({
      feedback_id: existingFeedback.id,
      user_id: existingFeedback.user?.id?.toString() ?? "unknown",
      thumb_direction: existingFeedback.thumbDirection as "up" | "down",
      content: existingFeedback.content ?? undefined,
      is_conversation_shared: existingFeedback.isConversationShared,
      created_at: existingFeedback.createdAt.toISOString(),
    }));

  // Combine existing feedbacks with the new feedback
  const allFeedbacks = [...existingAnalyticsFeedbacks, feedback];

  logger.info(
    {
      agentMessageId: message.agentMessageId,
      existingCount: existingAnalyticsFeedbacks.length,
      newFeedback: feedback,
      totalCount: allFeedbacks.length
    },
    "Storing agent message feedback activity with all feedbacks"
  );

  await updateAnalyticsFeedback(auth, {
    message: agentMessage,
    feedbacks: allFeedbacks
  });
}
