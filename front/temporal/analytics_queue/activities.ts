import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import { updateAnalyticsFeedback } from "@app/lib/analytics/feedback";
import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import type { AgentMessageFeedbackModel } from "@app/lib/models/agent/conversation";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { UserMessageOrigin } from "@app/types";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
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
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;
  const workspace = auth.getNonNullableWorkspace();

  const { agentMessageId, userMessageId } = agentLoopArgs;

  // Query the Message/AgentMessage/Conversation rows.
  const agentMessageRow = await MessageModel.findOne({
    where: {
      sId: agentMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: ConversationModel,
        as: "conversation",
        required: true,
      },
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!agentMessageRow) {
    throw new Error("Message not found");
  }

  const { agentMessage: agentAgentMessageRow, conversation: conversationRow } =
    agentMessageRow;

  if (!agentAgentMessageRow || !conversationRow) {
    throw new Error("Agent message or conversation not found");
  }

  // Query the UserMessage row to get user.
  const userMessageRow = await MessageModel.findOne({
    where: {
      sId: userMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
        include: [
          {
            model: UserModel,
            as: "user",
            required: false,
          },
        ],
      },
    ],
  });

  if (!userMessageRow) {
    throw new Error("User message not found");
  }

  const { userMessage: userUserMessageRow } = userMessageRow;

  if (!userUserMessageRow) {
    throw new Error("User message not found");
  }

  await storeAgentAnalytics(auth, {
    agentMessageRow,
    agentAgentMessageRow,
    userModel: userUserMessageRow.user ?? null,
    conversationRow,
    contextOrigin: userUserMessageRow.userContextOrigin,
  });
}

/**
 * Build and store the complete analytics document for an agent message.
 */
export async function storeAgentAnalytics(
  auth: Authenticator,
  params: {
    agentMessageRow: MessageModel;
    agentAgentMessageRow: AgentMessageModel;
    userModel: UserModel | null;
    conversationRow: ConversationModel;
    contextOrigin: UserMessageOrigin | null;
  }
): Promise<void> {
  const {
    agentMessageRow,
    agentAgentMessageRow,
    userModel,
    conversationRow,
    contextOrigin,
  } = params;
  // Only index agent messages if there are no blocked actions awaiting approval.
  const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentAgentMessageRow.id,
  ]);

  const hasBlockedActions = actions.some((action) =>
    isToolExecutionStatusBlocked(action.status)
  );

  if (hasBlockedActions) {
    return;
  }

  // Collect token usage from run data.
  const tokens = await collectTokenUsage(auth, agentAgentMessageRow);

  // Collect tool usage data from the agent message actions.
  const toolsUsed = await collectToolUsageFromMessage(auth, actions);

  // Collect feedback from the agent message.
  const feedbacks = agentAgentMessageRow.feedbacks
    ? getAgentMessageFeedbackAnalytics(agentAgentMessageRow.feedbacks)
    : [];

  const apiKey = auth.key();

  // Build the complete analytics document.
  const document: AgentMessageAnalyticsData = {
    agent_id: agentAgentMessageRow.agentConfigurationId,
    agent_version: agentAgentMessageRow.agentConfigurationVersion.toString(),
    conversation_id: conversationRow.sId,
    context_origin: contextOrigin,
    latency_ms: agentAgentMessageRow.modelInteractionDurationMs ?? 0,
    message_id: agentMessageRow.sId,
    status: agentAgentMessageRow.status,
    timestamp: new Date(agentMessageRow.createdAt).toISOString(),
    tokens,
    tools_used: toolsUsed,
    user_id: userModel?.sId ?? "unknown",
    workspace_id: auth.getNonNullableWorkspace().sId,
    feedbacks,
    version: agentMessageRow.version.toString(),
    auth_method: auth.authMethod(),
    api_key_name: apiKey?.name,
  };

  await storeToElasticsearch(document);
}

/**
 * Collect token usage from runs associated with this agent message.
 */
async function collectTokenUsage(
  auth: Authenticator,
  agentMessage: AgentMessageModel
): Promise<AgentMessageAnalyticsTokens> {
  if (!agentMessage.runIds || agentMessage.runIds.length === 0) {
    return {
      prompt: 0,
      completion: 0,
      reasoning: 0,
      cached: 0,
      cost_micro_usd: 0,
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
      return {
        prompt: acc.prompt + usage.promptTokens,
        completion: acc.completion + usage.completionTokens,
        reasoning: acc.reasoning, // No reasoning tokens in RunUsageType yet.
        cached: acc.cached + (usage.cachedTokens ?? 0),
        cost_micro_usd: acc.cost_micro_usd + usage.costMicroUsd,
      };
    },
    {
      prompt: 0,
      completion: 0,
      reasoning: 0,
      cached: 0,
      cost_micro_usd: 0,
    }
  );
}

/**
 * Collect tool usage data from agent message actions.
 */
async function collectToolUsageFromMessage(
  auth: Authenticator,
  actionResources: AgentMCPActionResource[]
): Promise<AgentMessageAnalyticsToolUsed[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const uniqueConfigIds = Array.from(
    new Set(actionResources.map((a) => a.mcpServerConfigurationId))
  );

  const serverConfigs = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId,
      id: uniqueConfigIds,
    },
  });

  const configIdToSId = new Map<string, string>();
  for (const cfg of serverConfigs) {
    configIdToSId.set(cfg.id.toString(), cfg.sId);
  }

  return actionResources.map((actionResource) => {
    return {
      step_index: actionResource.stepContent.step,
      server_name:
        actionResource.metadata.internalMCPServerName ??
        actionResource.metadata.mcpServerId ??
        "unknown",
      tool_name:
        actionResource.functionCallName.split(TOOL_NAME_SEPARATOR).pop() ??
        actionResource.functionCallName,
      mcp_server_configuration_sid:
        configIdToSId.get(actionResource.mcpServerConfigurationId) ?? undefined,
      execution_time_ms: actionResource.executionDurationMs,
      status: actionResource.status,
    };
  });
}

function makeAgentMessageAnalyticsDocumentId({
  messageId,
  version,
  workspaceId,
}: {
  messageId: string;
  version: string;
  workspaceId: string;
}): string {
  return `${workspaceId}_${messageId}_${version}`;
}

/**
 * Store document directly to Elasticsearch.
 */
async function storeToElasticsearch(
  document: AgentMessageAnalyticsData
): Promise<void> {
  const documentId = makeAgentMessageAnalyticsDocumentId({
    messageId: document.message_id,
    version: document.version,
    workspaceId: document.workspace_id,
  });

  await withEs(async (client) => {
    await client.index({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      body: document,
    });
  });
}

function getAgentMessageFeedbackAnalytics(
  agentMessageFeedbacks:
    | AgentMessageFeedbackResource[]
    | AgentMessageFeedbackModel[]
): AgentMessageAnalyticsFeedback[] {
  return agentMessageFeedbacks.map((agentMessageFeedback) => ({
    feedback_id: agentMessageFeedback.id,
    user_id: agentMessageFeedback.user?.sId ?? "unknown",
    thumb_direction: agentMessageFeedback.thumbDirection,
    dismissed: agentMessageFeedback.dismissed,
    is_conversation_shared: agentMessageFeedback.isConversationShared,
    created_at: agentMessageFeedback.createdAt.toISOString(),
  }));
}

export async function storeAgentMessageFeedbackActivity(
  authType: AuthenticatorType,
  {
    message,
  }: {
    message: AgentMessageRef;
  }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;

  const workspace = auth.getNonNullableWorkspace();

  const agentMessageRow = await MessageModel.findOne({
    where: {
      sId: message.agentMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: AgentMessageModel,
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

  const agentMessageFeedbacks =
    await AgentMessageFeedbackResource.listByAgentMessageModelId(
      auth,
      agentMessageModel.id
    );

  await updateAnalyticsFeedback(
    {
      documentId: makeAgentMessageAnalyticsDocumentId({
        messageId: message.agentMessageId,
        version: agentMessageRow.version.toString(),
        workspaceId: workspace.sId,
      }),
    },
    getAgentMessageFeedbackAnalytics(agentMessageFeedbacks)
  );
}
