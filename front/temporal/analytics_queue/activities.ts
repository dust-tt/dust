import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { isSearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { updateAnalyticsFeedback } from "@app/lib/analytics/feedback";
import {
  AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
  ANALYTICS_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import { addTraceToLangfuseDataset } from "@app/lib/api/instrumentation/langfuse_datasets";
import { isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import type { AgentMessageFeedbackModel } from "@app/lib/models/agent/conversation";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMCPServerConfigurationResource } from "@app/lib/resources/agent_mcp_server_configuration_resource";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import type {
  AgentMessageAnalyticsData,
  AgentMessageAnalyticsFeedback,
  AgentMessageAnalyticsSkillUsed,
  AgentMessageAnalyticsTokens,
  AgentMessageAnalyticsToolUsed,
  AgentRetrievalOutputAnalyticsData,
} from "@app/types/assistant/analytics";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { sha256 } from "@app/types/shared/utils/hashing";
import type { WhereOptions } from "sequelize";

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
    userMessageModel: userUserMessageRow,
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
    userMessageModel: UserMessageModel;
    conversationRow: ConversationModel;
    contextOrigin: UserMessageOrigin | null;
  }
): Promise<void> {
  const {
    agentMessageRow,
    agentAgentMessageRow,
    userModel,
    userMessageModel,
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
    const blockedStatuses = actions
      .filter((a) => isToolExecutionStatusBlocked(a.status))
      .map((a) => a.status);

    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        conversationId: conversationRow.sId,
        agentMessageId: agentMessageRow.sId,
        actionCount: actions.length,
        blockedStatuses,
      },
      "[Analytics] Skipping ingestion due to blocked actions"
    );

    return;
  }

  // Collect token usage from run data.
  const tokens = await collectTokenUsage(auth, agentAgentMessageRow);

  // Collect skills usage data and build the mapping for tool attribution.
  const { skillsUsed, mcpServerViewIdToSkill } =
    await collectSkillsUsageFromMessage(auth, agentAgentMessageRow.id);

  // Collect tool usage data from the agent message actions with skill attribution.
  const toolsUsed = await collectToolUsageFromMessage(
    auth,
    actions,
    mcpServerViewIdToSkill
  );

  // Collect feedback from the agent message.
  const feedbacks = agentAgentMessageRow.feedbacks
    ? getAgentMessageFeedbackAnalytics(agentAgentMessageRow.feedbacks)
    : [];

  // Resolve API key name from stored ID, falling back to auth context if key was deleted.
  let apiKeyName: string | undefined;
  const storedKeyId = userMessageModel.userContextApiKeyId;
  if (storedKeyId) {
    const keyResource = await KeyResource.fetchByModelId(storedKeyId);
    if (keyResource) {
      apiKeyName = keyResource.name;
    }
  }
  // Build the complete analytics document.
  const document: AgentMessageAnalyticsData = {
    agent_id: agentAgentMessageRow.agentConfigurationId,
    agent_version: agentAgentMessageRow.agentConfigurationVersion.toString(),
    conversation_id: conversationRow.sId,
    context_origin: contextOrigin,
    latency_ms: agentAgentMessageRow.modelInteractionDurationMs ?? 0,
    message_id: agentMessageRow.sId,
    skills_used: skillsUsed,
    status: agentAgentMessageRow.status,
    timestamp: new Date(agentMessageRow.createdAt).toISOString(),
    tokens,
    tools_used: toolsUsed,
    user_id: userModel?.sId ?? "unknown",
    workspace_id: auth.getNonNullableWorkspace().sId,
    feedbacks,
    version: agentMessageRow.version.toString(),
    auth_method: userMessageModel.userContextAuthMethod ?? auth.authMethod(),
    api_key_name: apiKeyName,
  };

  await storeToElasticsearch(document);

  const toolOutputs = await extractRetrievalDocuments(auth, {
    agentMessageRow,
    agentAgentMessageRow,
    conversationRow,
    actions,
  });

  if (toolOutputs.length > 0) {
    await storeRetrievalOutputsToElasticsearch(toolOutputs);
  }
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

type SkillAttribution = {
  skillId: string;
  skillName: string;
};

/**
 * Collect tool usage data from agent message actions.
 */
async function collectToolUsageFromMessage(
  auth: Authenticator,
  actionResources: AgentMCPActionResource[],
  mcpServerViewIdToSkill: Map<string, SkillAttribution>
): Promise<AgentMessageAnalyticsToolUsed[]> {
  const uniqueConfigIds = Array.from(
    new Set(actionResources.map((a) => a.mcpServerConfigurationId))
  );

  // Convert string IDs to numeric ModelIds at call site.
  const configModelIds: ModelId[] = uniqueConfigIds
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));

  const serverConfigs =
    await AgentMCPServerConfigurationResource.fetchByModelIds(
      auth,
      configModelIds
    );

  const configIdToSId = new Map(
    serverConfigs.map((cfg) => [cfg.id.toString(), cfg.sId])
  );

  // Build a map from configId to mcpServerViewId for skill attribution.
  const configIdToMcpServerViewId = new Map(
    serverConfigs.map((cfg) => [cfg.id.toString(), cfg.mcpServerViewId])
  );

  return actionResources.map((actionResource) => {
    // Get the mcpServerViewId for this action to look up skill attribution.
    const mcpServerViewId = configIdToMcpServerViewId.get(
      actionResource.mcpServerConfigurationId
    );
    const skillInfo = mcpServerViewId
      ? mcpServerViewIdToSkill.get(mcpServerViewId.toString())
      : undefined;

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
      via_skill: !!skillInfo,
      skill_id: skillInfo?.skillId,
      skill_name: skillInfo?.skillName,
    };
  });
}

/**
 * Collect skills usage data from agent message.
 * Returns both the skills used and a mapping of mcpServerViewId to skill info for tool attribution.
 */
async function collectSkillsUsageFromMessage(
  auth: Authenticator,
  agentMessageId: ModelId
): Promise<{
  skillsUsed: AgentMessageAnalyticsSkillUsed[];
  mcpServerViewIdToSkill: Map<string, SkillAttribution>;
}> {
  const workspace = auth.getNonNullableWorkspace();

  const skillRecords = await AgentMessageSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
      agentMessageId,
    } as WhereOptions<AgentMessageSkillModel>,
    include: [
      {
        model: SkillConfigurationModel,
        as: "customSkill",
        attributes: ["id", "name"],
        required: false,
        include: [
          {
            model: SkillMCPServerConfigurationModel,
            as: "mcpServerConfigurations",
            attributes: ["mcpServerViewId"],
            required: false,
          },
        ],
      },
    ],
  });

  // Fetch global skill definitions for any global skills referenced.
  const globalSkillIds: string[] = [];
  for (const r of skillRecords) {
    if (r.globalSkillId !== null) {
      globalSkillIds.push(r.globalSkillId);
    }
  }

  const globalSkillsMap = new Map<string, GlobalSkillDefinition>();
  if (globalSkillIds.length > 0) {
    const globalSkills = await GlobalSkillsRegistry.findAll(auth, {
      sId: globalSkillIds,
    });
    for (const skill of globalSkills) {
      globalSkillsMap.set(skill.sId, skill);
    }
  }

  const skillsUsed: AgentMessageAnalyticsSkillUsed[] = [];
  const mcpServerViewIdToSkill = new Map<string, SkillAttribution>();

  for (const record of skillRecords) {
    // Custom skill case.
    if (record.customSkillId && record.customSkill) {
      const customSkill = record.customSkill;
      const skillId = makeSId("skill", {
        id: customSkill.id,
        workspaceId: workspace.id,
      });

      skillsUsed.push({
        skill_id: skillId,
        skill_name: customSkill.name,
        skill_type: "custom",
        source: record.source,
      });

      // Map all MCP server views from this skill.
      for (const mcpConfig of customSkill.mcpServerConfigurations ?? []) {
        mcpServerViewIdToSkill.set(mcpConfig.mcpServerViewId.toString(), {
          skillId,
          skillName: customSkill.name,
        });
      }
      continue;
    }

    // Global skill case.
    if (record.globalSkillId) {
      const globalSkill = globalSkillsMap.get(record.globalSkillId);

      skillsUsed.push({
        skill_id: record.globalSkillId,
        skill_name: globalSkill?.name ?? record.globalSkillId,
        skill_type: "global",
        source: record.source,
      });
      // Note: Global skills have internal MCP servers without mcpServerViewIds in the DB.
      // Tool attribution for global skills would require matching by internalMCPServerId.
    }
  }

  return { skillsUsed, mcpServerViewIdToSkill };
}

// Internal server that doesn't have a persistent DB configuration.
const FILE_SYSTEM_SERVER_NAME = "data_sources_file_system";

async function extractRetrievalDocuments(
  auth: Authenticator,
  {
    agentMessageRow,
    agentAgentMessageRow,
    conversationRow,
    actions,
  }: {
    agentMessageRow: MessageModel;
    agentAgentMessageRow: AgentMessageModel;
    conversationRow: ConversationModel;
    actions: AgentMCPActionResource[];
  }
): Promise<AgentRetrievalOutputAnalyticsData[]> {
  const workspace = auth.getNonNullableWorkspace();

  const searchActions = actions.filter((action) =>
    isLightServerSideMCPToolConfiguration(action.toolConfiguration)
  );

  if (searchActions.length === 0) {
    return [];
  }

  // Filter out file_system server actions - they don't have DB configurations.
  // Note: file_system uses ID 1010 (positive), so we can't rely on id > 0 alone.
  const actionsWithConfigs = searchActions.filter(
    (a) => a.metadata.internalMCPServerName !== FILE_SYSTEM_SERVER_NAME
  );
  const configIds = Array.from(
    new Set(actionsWithConfigs.map((a) => a.mcpServerConfigurationId))
  );

  // Convert string IDs to numeric ModelIds.
  // Filter out non-positive IDs as a defensive check - some internal servers
  // may use fake negative IDs (e.g., -1) that don't exist in the database.
  const configModelIds: ModelId[] = configIds
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id) && id > 0);

  // Fetch MCP server configurations for analytics tracking.
  // Using standalone resource allows independent querying for reporting purposes.
  const [outputItemsByActionId, serverConfigs] = await Promise.all([
    AgentMCPActionResource.fetchOutputItemsByActionIds(
      auth,
      searchActions.map((a) => a.id)
    ),
    AgentMCPServerConfigurationResource.fetchByModelIds(auth, configModelIds),
  ]);

  const configMap = new Map(serverConfigs.map((c) => [c.id.toString(), c]));

  const baseDocument = {
    message_id: agentMessageRow.sId,
    workspace_id: workspace.sId,
    conversation_id: conversationRow.sId,
    agent_id: agentAgentMessageRow.agentConfigurationId,
    agent_version: agentAgentMessageRow.agentConfigurationVersion.toString(),
    timestamp: new Date(agentMessageRow.createdAt).toISOString(),
  };

  const partialDocuments: (typeof baseDocument & {
    mcp_server_configuration_id?: number;
    mcp_server_name: string;
    data_source_view_id: string;
    data_source_id: string;
    document_id: string;
  })[] = [];
  const dataSourceViewIds = new Set<string>();

  for (const action of searchActions) {
    const actionOutputItems = outputItemsByActionId.get(action.id);
    if (!actionOutputItems) {
      continue;
    }

    const config = configMap.get(action.mcpServerConfigurationId);
    const mcpServerName =
      action.metadata.internalMCPServerName ??
      action.metadata.mcpServerId ??
      "unknown";

    for (const outputItem of actionOutputItems) {
      if (!isSearchResultResourceType(outputItem.content)) {
        continue;
      }

      const searchResult = outputItem.content.resource;
      const dataSourceViewId = searchResult.source.data_source_view_id;
      const dataSourceId = searchResult.source.data_source_id;

      if (!dataSourceViewId || !dataSourceId) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            messageId: agentMessageRow.sId,
            documentId: searchResult.id,
          },
          "[extractRetrievalDocuments] Search result missing data source IDs"
        );

        continue;
      }

      dataSourceViewIds.add(dataSourceViewId);

      partialDocuments.push({
        ...baseDocument,
        ...(config ? { mcp_server_configuration_id: config.id } : {}),
        mcp_server_name: mcpServerName,
        data_source_view_id: dataSourceViewId,
        data_source_id: dataSourceId,
        document_id: searchResult.id,
      });
    }
  }

  // Fetch only the data source views that actually appear in results
  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    Array.from(dataSourceViewIds)
  );

  const dataSourceViewMap = new Map<string, string>();
  for (const dsv of dataSourceViews) {
    if (dsv.dataSource) {
      dataSourceViewMap.set(dsv.sId, dsv.dataSource.name);
    }
  }

  // Enrich partial documents with data source names
  const documents: AgentRetrievalOutputAnalyticsData[] = [];
  for (const partial of partialDocuments) {
    const dataSourceName = dataSourceViewMap.get(partial.data_source_view_id);
    if (!dataSourceName) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          messageId: agentMessageRow.sId,
          dataSourceViewId: partial.data_source_view_id,
          documentId: partial.document_id,
        },
        "[extractRetrievalDocuments] Data source view not found"
      );

      continue;
    }

    documents.push({
      ...partial,
      data_source_name: dataSourceName,
    });
  }

  return documents;
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

  const result = await withEs(async (client) => {
    await client.index({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      body: document,
    });
  });

  if (result.isErr()) {
    logger.error(
      {
        error: result.error,
        documentId,
        workspaceId: document.workspace_id,
        messageId: document.message_id,
      },
      "[Analytics] Failed to write analytics document to ES"
    );

    throw new Error(`ES write failed: ${result.error.message}`);
  }
}

function makeRetrievalOutputDocumentId({
  workspaceId,
  messageId,
  documentId,
  dataSourceViewId,
}: {
  workspaceId: string;
  messageId: string;
  documentId: string;
  dataSourceViewId: string;
}): string {
  // Hash the raw document ID to ensure safe Elasticsearch _id.
  // Document IDs from data sources may contain special characters or be very long.
  const normalizedDocId = sha256(documentId);
  return `${workspaceId}_${messageId}_${dataSourceViewId}_${normalizedDocId}`;
}

async function storeRetrievalOutputsToElasticsearch(
  documents: AgentRetrievalOutputAnalyticsData[]
): Promise<void> {
  if (documents.length === 0) {
    return;
  }

  const result = await withEs(async (client) => {
    const bulkBody = documents.flatMap((doc) => [
      {
        index: {
          _index: AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
          _id: makeRetrievalOutputDocumentId({
            workspaceId: doc.workspace_id,
            messageId: doc.message_id,
            documentId: doc.document_id,
            dataSourceViewId: doc.data_source_view_id,
          }),
        },
      },
      doc,
    ]);

    await client.bulk({ body: bulkBody });
  });

  const workspaceId = documents[0]?.workspace_id ?? "unknown";

  if (result.isErr()) {
    logger.error(
      {
        error: result.error,
        workspaceId,
        documentCount: documents.length,
        messageId: documents[0]?.message_id,
      },
      "[Analytics] Failed to write retrieval outputs to ES"
    );

    throw new Error(`ES bulk write failed: ${result.error.message}`);
  }
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

  const { agentConfigurationId } = agentMessageModel;
  if (isGlobalAgentId(agentConfigurationId)) {
    // Add negative feedback traces to Langfuse dataset for global agents
    await appendNegativeFeedbackTracesToLangfuseDataset({
      auth,
      agentMessageModel,
      agentMessageFeedbacks,
    });
  }
}

/**
 * Appends traces to Langfuse dataset when negative feedback is given on global agents.
 * This enables later annotation and analysis of problematic agent responses.
 *
 * Uses `sourceTraceId` to link dataset items to existing Langfuse traces
 * (sent via OpenTelemetry), rather than fetching trace data from GCS.
 */
async function appendNegativeFeedbackTracesToLangfuseDataset({
  auth,
  agentMessageModel,
  agentMessageFeedbacks,
}: {
  auth: Authenticator;
  agentMessageModel: AgentMessageModel;
  agentMessageFeedbacks: AgentMessageFeedbackResource[];
}): Promise<void> {
  const { agentConfigurationId } = agentMessageModel;
  const workspaceId = auth.getNonNullableWorkspace().sId;

  // Find negative (thumbs down) feedbacks that haven't been dismissed
  const negativeFeedbacks = agentMessageFeedbacks.filter(
    (feedback) => feedback.thumbDirection === "down" && !feedback.dismissed
  );

  if (negativeFeedbacks.length === 0) {
    return;
  }

  // Get run IDs from agent message
  const runIds = agentMessageModel.runIds ?? [];
  const llmTraceIds = runIds.filter(isLLMTraceId);

  if (llmTraceIds.length === 0) {
    logger.info(
      {
        agentConfigurationId,
        agentMessageId: agentMessageModel.id,
        runIdsCount: runIds.length,
      },
      "[Langfuse] No LLM trace IDs found for negative feedback on global agent"
    );
    return;
  }

  const datasetName = `${agentConfigurationId}-feedback`;
  // Feedback applies to the final agent response, so use the most recent LLM trace.
  const latestTraceId = llmTraceIds[llmTraceIds.length - 1];

  for (const feedback of negativeFeedbacks) {
    await addTraceToLangfuseDataset({
      datasetName,
      dustTraceId: latestTraceId,
      feedbackId: feedback.id,
      workspaceId,
      feedbackContent: feedback.content,
      thumbDirection: feedback.thumbDirection,
    });
  }
}
