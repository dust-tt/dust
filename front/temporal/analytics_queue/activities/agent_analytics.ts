import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameFromSId,
  SEARCH_SERVER_NAME,
  SEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { isSearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { updateAnalyticsFeedback } from "@app/lib/analytics/feedback";
import { resolvedModelFromAgentMessageRow } from "@app/lib/api/assistant/models";
import {
  AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
  ANALYTICS_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import { addTraceToLangfuseDataset } from "@app/lib/api/instrumentation/langfuse_datasets";
import { isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import type {
  AgentMessageBillingAction,
  AgentMessageToolBillingLine,
} from "@app/lib/credits/agent_message_billing";
import {
  buildAgentMessageBillingPlan,
  computeRunKey,
} from "@app/lib/credits/agent_message_billing";
import type { AgentMessageFeedbackModel } from "@app/lib/models/agent/conversation";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMCPServerConfigurationResource } from "@app/lib/resources/agent_mcp_server_configuration_resource";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import type { SkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { makeSId } from "@app/lib/resources/string_ids";
import { TagResource } from "@app/lib/resources/tags_resource";
import logger from "@app/logger/logger";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import type {
  AgentMessageAnalyticsData,
  AgentMessageAnalyticsFeedback,
  AgentMessageAnalyticsModel,
  AgentMessageAnalyticsSkillUsed,
  AgentMessageAnalyticsTokens,
  AgentMessageAnalyticsToolUsed,
  AgentRetrievalOutputAnalyticsData,
} from "@app/types/assistant/analytics";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import {
  ACTIVATION_NUDGE_ORIGIN,
  AGENT_MESSAGE_STATUSES_TO_TRACK,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { sha256 } from "@app/types/shared/utils/encryption";
import type { WhereOptions } from "sequelize";

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

  // Activation Pod nudges are sent by us, not asked for by the user: they must
  // not show up anywhere in analytics, not even as a 0-credit row (this drops
  // them from the credits tables, per-agent usage, and the DAU signal the
  // activation evaluator itself reads).
  if (userUserMessageRow.userContextOrigin === ACTIVATION_NUDGE_ORIGIN) {
    return;
  }

  await storeAgentAnalytics(auth, {
    agentMessageRow,
    agentAgentMessageRow,
    userModel: userUserMessageRow.user ?? null,
    userMessageModel: userUserMessageRow,
    conversationRow,
    contextOrigin: userUserMessageRow.userContextOrigin,
    dustRunIds: agentLoopArgs.dustRunIds,
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
    dustRunIds?: string[];
  }
): Promise<void> {
  const {
    agentMessageRow,
    agentAgentMessageRow,
    userModel,
    userMessageModel,
    conversationRow,
    contextOrigin,
    dustRunIds,
  } = params;
  const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentAgentMessageRow.id,
  ]);

  // Tag this execution's runs with their runKey before reading usages, so the
  // per-execution ceiling in `intelligenceAwuFromRunUsagesGroupedByRunKey`
  // matches the billed amount. Without this, an analytics index that runs
  // before the credit path has tagged the runs collapses every execution into
  // one `LEGACY_RUN_KEY` group and single-ceils the message — under-counting
  // `llm_awu` on multi-execution (interrupt/resume) messages. Idempotent: same
  // `dustRunIds` → same runKey as the credit/emit paths.
  if (dustRunIds && dustRunIds.length > 0) {
    await RunResource.setRunKeyForDustRunIds(auth, {
      dustRunIds,
      runKey: computeRunKey(dustRunIds),
    });
  }

  const messageCreatedAt = new Date(agentMessageRow.createdAt);

  // Seat type as of the message time, to stamp `is_free_seat`. Mirrors Metronome's
  // free-seat user-id split: free-seat usage is dropped from a user's consumed
  // credits once they upgrade to a paid seat. Defaults to non-free when the
  // message has no associated user (system/doNotAssociateUser messages).
  const seatType = userModel
    ? await MembershipResource.getActiveSeatTypeForUserModelId({
        workspace: auth.getNonNullableWorkspace(),
        userModelId: userModel.id,
        at: messageCreatedAt,
      })
    : null;
  const isFreeSeat = seatType === "free";

  const runUsages = await fetchRunUsagesForMessage(auth, agentAgentMessageRow);

  // Collect token usage from run data.
  const tokens = aggregateTokenUsage(runUsages);

  // Collect skills usage data.
  const skillsUsed = await collectSkillsUsageFromMessage(
    auth,
    agentAgentMessageRow.id
  );

  const billingPlan = buildAgentMessageBillingPlan({
    actions: actions.map((actionResource) => {
      const action = actionResource.toJSON();

      return {
        actionResource,
        internalMCPServerName: action.internalMCPServerName,
        mcpServerId: action.mcpServerId,
        status: action.status,
        toolName: getToolNameFromFunctionCallName(
          actionResource.functionCallName
        ),
      };
    }),
    contextOrigin,
    runUsages,
  });

  // Collect tool usage data from the same billing lines used for the totals.
  const toolsUsed = await collectToolUsageFromMessage(auth, billingPlan.tools);

  // Collect the agent's tag ids at message time.
  // NOTE: may not be stable over time, see `collectAgentTagIds` for details.
  const agentTagIds = await collectAgentTagIds(auth, agentAgentMessageRow);

  // Model that actually ran the message (resolved at message creation).
  const model = collectResolvedModel(agentAgentMessageRow);

  const llmAwu = billingPlan.totals.llmBilledCredits;
  const toolAwu = billingPlan.totals.toolBilledCredits;

  const isBillable = AGENT_MESSAGE_STATUSES_TO_TRACK.includes(
    agentAgentMessageRow.status
  );

  const cost = {
    full_awu: llmAwu + toolAwu,
    llm_awu: llmAwu,
    tool_awu: toolAwu,
    billable_awu: isBillable
      ? llmAwu + toolAwu
      : (agentAgentMessageRow.costCredits ?? 0),
  };

  // TODO: replace with a recursive research of ancestor messages
  const agentOriginMessageId = userMessageModel.agenticOriginMessageId;
  const ancestorMessageIds =
    userMessageModel.agenticMessageType === "run_agent" && agentOriginMessageId
      ? [agentOriginMessageId]
      : [];

  // Collect feedback from the agent message.
  const feedbacks = agentAgentMessageRow.feedbacks
    ? getAgentMessageFeedbackAnalytics(agentAgentMessageRow.feedbacks)
    : [];

  // Resolve API key name from stored ID, falling back to auth context if key was deleted.
  // System keys are Dust-internal plumbing (Slack bot, connectors, ...), not
  // workspace API usage: leave api_key_name unset so those messages report as
  // "Not API" in analytics.
  let apiKeyName: string | undefined;
  const storedKeyId = userMessageModel.userContextApiKeyId;
  if (storedKeyId) {
    const keyResource = await KeyResource.fetchByWorkspaceAndId({
      workspace: auth.getNonNullableWorkspace(),
      id: storedKeyId,
    });
    if (keyResource && !keyResource.isSystem) {
      apiKeyName = keyResource.name;
    }
  }
  // Space the conversation lives in (pod usage analytics). The sId is derived
  // from the model id, no fetch needed.
  const spaceId = conversationRow.spaceId
    ? SpaceResource.modelIdToSId({
        id: conversationRow.spaceId,
        workspaceId: auth.getNonNullableWorkspace().id,
      })
    : null;

  // Build the complete analytics document.
  const document: AgentMessageAnalyticsData = {
    agent_id: agentAgentMessageRow.agentConfigurationId,
    agent_version: agentAgentMessageRow.agentConfigurationVersion.toString(),
    agent_tag_ids: agentTagIds,
    model,
    ancestor_message_ids: ancestorMessageIds,
    conversation_id: conversationRow.sId,
    space_id: spaceId,
    cost,
    context_origin: contextOrigin,
    latency_ms: agentAgentMessageRow.modelInteractionDurationMs ?? 0,
    message_id: agentMessageRow.sId,
    skills_used: skillsUsed,
    status: agentAgentMessageRow.status,
    is_free_seat: isFreeSeat,
    timestamp: messageCreatedAt.toISOString(),
    tokens,
    tools_used: toolsUsed,
    // Fall back to the authenticated user when the UserMessage row has no
    // associated user (doNotAssociateUser messages like pod_manager
    // sub-conversations), matching the Metronome usage path so analytics stays
    // attributable instead of landing in "unknown".
    user_id: userModel?.sId ?? auth.user()?.sId ?? "unknown",
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
 * Fetch the run usages for all runs associated with this agent message,
 * tagged with the runKey of the agent-loop execution they belong to (so
 * intelligence cost can be ceiled per execution, matching the billed
 * Metronome events).
 */
async function fetchRunUsagesForMessage(
  auth: Authenticator,
  agentMessage: AgentMessageModel
): Promise<(RunUsageType & { runKey: string | null })[]> {
  if (!agentMessage.runIds || agentMessage.runIds.length === 0) {
    return [];
  }

  const runResources = await RunResource.listByDustRunIds(auth, {
    dustRunIds: agentMessage.runIds,
  });
  return RunResource.listRunUsagesForRuns(auth, {
    runs: runResources,
  });
}

/**
 * Aggregate token usage from a set of run usages.
 */
function aggregateTokenUsage(
  runUsages: RunUsageType[]
): AgentMessageAnalyticsTokens {
  return runUsages.reduce(
    (acc, usage) => {
      return {
        prompt: acc.prompt + usage.promptTokens,
        completion: acc.completion + usage.completionTokens,
        reasoning: acc.reasoning + (usage.reasoningTokens ?? 0),
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
type AnalyticsBillingAction = AgentMessageBillingAction & {
  actionResource: AgentMCPActionResource;
};

async function collectToolUsageFromMessage(
  auth: Authenticator,
  billingLines: AgentMessageToolBillingLine<AnalyticsBillingAction>[]
): Promise<AgentMessageAnalyticsToolUsed[]> {
  const actionResources = billingLines.map(
    ({ action }) => action.actionResource
  );
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

  const mcpServerIds = [
    ...new Set(
      actionResources.flatMap((a) =>
        !a.metadata.internalMCPServerName && a.metadata.mcpServerId
          ? [a.metadata.mcpServerId]
          : []
      )
    ),
  ];
  const remoteServers = await RemoteMCPServerResource.fetchByIds(
    auth,
    mcpServerIds
  );
  const remoteServerMap = new Map(
    remoteServers.map((server) => [server.sId, server])
  );

  return billingLines.map(({ action, billedCredits }) => {
    const { actionResource, toolName } = action;
    const { internalMCPServerName, mcpServerId } = actionResource.metadata;
    const serverName =
      internalMCPServerName ??
      (mcpServerId && remoteServerMap.get(mcpServerId)?.cachedName) ??
      mcpServerId ??
      "unknown";

    return {
      step_index: actionResource.stepContent.step,
      server_name: serverName,
      tool_name: toolName,
      mcp_server_configuration_sid:
        configIdToSId.get(actionResource.mcpServerConfigurationId) ?? undefined,
      execution_time_ms: actionResource.executionDurationMs,
      status: actionResource.status,
      cost_awu: billedCredits,
    };
  });
}

/**
 * Collect the tag ids attached to the agent configuration version that
 * produced this message. Tags are stored per agent-configuration version, so we
 * resolve the exact version to capture the agent's tags at message time. Global
 * agents are code-defined and have no DB-backed tags.
 *
 * NOTE: there are several ways to edit agent tags, which creates a discrepancy:
 *  - if a tag is added/removed through the route `w/{Id}/assistant/agent_configurations/{sId}/tags`,
 *    the tag_agents model is updated and no new agent_configuration version is created.
 *  - if a tag is added/removed through the route `w/{Id}/assistant/agent_configurations/{sId}`,
 *    the agent_configuration version is bumped and the tag_agents model is updated.
 * It results that we can loose the history of tags for a given agent_configuration version if the first
 * route is used.
 */
async function collectAgentTagIds(
  auth: Authenticator,
  agentAgentMessageRow: AgentMessageModel
): Promise<string[]> {
  const { agentConfigurationId, agentConfigurationVersion } =
    agentAgentMessageRow;

  if (isGlobalAgentId(agentConfigurationId)) {
    return [];
  }

  const tags = await TagResource.listForAgentVersion(
    auth,
    agentConfigurationId,
    agentConfigurationVersion
  );

  return tags.map((tag) => tag.sId);
}

/**
 * Collect the model that actually ran this message, if available.
 */
function collectResolvedModel(
  agentAgentMessageRow: AgentMessageModel
): AgentMessageAnalyticsModel | null {
  const resolvedModel = resolvedModelFromAgentMessageRow(agentAgentMessageRow);

  if (!resolvedModel) {
    return null;
  }

  return {
    provider_id: resolvedModel.providerId,
    model_id: resolvedModel.modelId,
    reasoning_effort: resolvedModel.reasoningEffort,
    resolution_method: agentAgentMessageRow.modelResolutionMethod,
  };
}

/**
 * Collect skills usage data from agent message.
 */
async function collectSkillsUsageFromMessage(
  auth: Authenticator,
  agentMessageId: ModelId
): Promise<AgentMessageAnalyticsSkillUsed[]> {
  const workspace = auth.getNonNullableWorkspace();

  const where: WhereOptions<AgentMessageSkillModel> = {
    agentMessageId,
    workspaceId: workspace.id,
  };

  const skillRecords = await AgentMessageSkillModel.findAll({
    where,
    include: [
      {
        model: SkillConfigurationModel,
        as: "customSkill",
        attributes: ["id", "name"],
        required: false,
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

  const globalSkillsMap = new Map<string, SkillDefinition>();
  if (globalSkillIds.length > 0) {
    const globalSkills = await GlobalSkillsRegistry.findAll(auth, {
      sId: globalSkillIds,
    });
    const systemSkills = await SystemSkillsRegistry.findAll(auth, {
      sId: globalSkillIds,
    });
    for (const skill of [...globalSkills, ...systemSkills]) {
      globalSkillsMap.set(skill.sId, skill);
    }
  }

  const skillsUsed: AgentMessageAnalyticsSkillUsed[] = [];

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
    }
  }

  return skillsUsed;
}

const DATA_SOURCES_FILE_SYSTEM_SERVER_NAME = "data_sources_file_system";

function getDataSourceRetrievalDocumentsInternalMCPServerName(
  action: AgentMCPActionResource
): InternalMCPServerNameType | null {
  // Keep this aligned with DATA_SOURCE_SEARCH_RESULT producers whose source includes
  // both data_source_id and data_source_view_id. Slack and Notion use the same output
  // mime type, but only include provider metadata.
  if (!isLightServerSideMCPToolConfiguration(action.toolConfiguration)) {
    return null;
  }

  if (action.toolConfiguration.originalName !== SEARCH_TOOL_NAME) {
    return null;
  }

  return (
    action.metadata.internalMCPServerName ??
    getInternalMCPServerNameFromSId(
      action.toolConfiguration.internalMCPServerId ?? null
    )
  );
}

function isDataSourceRetrievalDocumentsAction(
  action: AgentMCPActionResource
): boolean {
  const internalMCPServerName =
    getDataSourceRetrievalDocumentsInternalMCPServerName(action);

  return (
    internalMCPServerName === SEARCH_SERVER_NAME ||
    internalMCPServerName === DATA_SOURCES_FILE_SYSTEM_SERVER_NAME
  );
}

function isDataSourcesFileSystemRetrievalDocumentsAction(
  action: AgentMCPActionResource
): boolean {
  return (
    getDataSourceRetrievalDocumentsInternalMCPServerName(action) ===
    DATA_SOURCES_FILE_SYSTEM_SERVER_NAME
  );
}

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

  const retrievalDocumentActions = actions.filter(
    isDataSourceRetrievalDocumentsAction
  );

  if (retrievalDocumentActions.length === 0) {
    return [];
  }

  // Filter out file_system server actions - they don't have DB configurations.
  // Note: file_system uses ID 1010 (positive), so we can't rely on id > 0 alone.
  const actionsWithConfigs = retrievalDocumentActions.filter(
    (action) => !isDataSourcesFileSystemRetrievalDocumentsAction(action)
  );
  const configIds = Array.from(
    new Set(actionsWithConfigs.map((action) => action.mcpServerConfigurationId))
  );

  // Convert string IDs to numeric ModelIds.
  // Filter out non-positive IDs as a defensive check - some internal servers
  // may use fake negative IDs (e.g., -1) that don't exist in the database.
  const configModelIds: ModelId[] = configIds
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id) && id > 0);

  const outputItemsByActionId =
    await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: retrievalDocumentActions.map((action) => action.id),
      ignoreContent: false,
    });
  // Fetch MCP server configurations for analytics tracking.
  // Using standalone resource allows independent querying for reporting purposes.
  const serverConfigs =
    await AgentMCPServerConfigurationResource.fetchByModelIds(
      auth,
      configModelIds
    );

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

  for (const action of retrievalDocumentActions) {
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
  const auth = await Authenticator.fromJSON(authType);

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
