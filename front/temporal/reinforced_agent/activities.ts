import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { LlmConversationOptions } from "@app/lib/api/llm/batch_llm";
import {
  downloadBatchResultFromLlm,
  sendBatchCallToLlm,
} from "@app/lib/api/llm/batch_llm";
import type { BatchStatus } from "@app/lib/api/llm/types/batch";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { notifyAgentSuggestionsReady } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import {
  aggregateSyntheticSuggestions,
  buildAggregationBatchMap,
} from "@app/lib/reinforced_agent/aggregate_suggestions";
import {
  analyzeConversationForReinforcement,
  buildConversationAnalysisBatchMap,
} from "@app/lib/reinforced_agent/analyze_conversation";
import {
  getReinforcedLLM,
  getReinforcementDefaultOptions,
  processReinforcedEvents,
  REINFORCEMENT_AGENT_ID,
  reinforcementConversationTitle,
} from "@app/lib/reinforced_agent/run_reinforced_analysis";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { updateActiveTrace } from "@langfuse/tracing";
import { ApplicationFailure } from "@temporalio/common";

async function getAuthForWorkspace(
  workspaceId: string
): Promise<Authenticator> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw ApplicationFailure.nonRetryable(
      `Workspace not found: ${workspaceId}`
    );
  }
  return Authenticator.internalAdminForWorkspace(workspaceId);
}

/**
 * List workspace sIds that have the reinforced_agents feature flag.
 */
export async function getFlaggedWorkspacesActivity(): Promise<string[]> {
  const allWorkspaces = await WorkspaceResource.listAll();
  const flaggedIds: string[] = [];

  for (const workspace of allWorkspaces) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const featureFlags = await getFeatureFlags(auth);
    if (featureFlags.includes("reinforced_agents")) {
      flaggedIds.push(workspace.sId);
    }
  }

  return flaggedIds;
}

/**
 * List agent configuration sIds for active (non-global) agents in a workspace.
 */
export async function getAgentConfigurationsActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<string[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "published",
    variant: "extra_light",
  });

  // TODO(reinforced agent): for now, we only process those that are on, because we have not yet implemented 'auto' mode
  return agents
    .filter((a) => a.id > 0 && a.reinforcement === "on")
    .map((a) => a.sId);
}

/**
 * List recent conversation sIds that involved a specific agent.
 */
export async function getRecentConversationsForAgentActivity({
  workspaceId,
  agentConfigurationId,
  conversationLookbackDays = 1,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  conversationLookbackDays?: number;
}): Promise<string[]> {
  updateActiveTrace({
    name: "Reinforced Agent Workflow",
    metadata: { agentConfigurationId },
  });

  const auth = await getAuthForWorkspace(workspaceId);

  const updatedSince = new Date();
  updatedSince.setHours(
    updatedSince.getHours() - conversationLookbackDays * 24
  );

  return ConversationResource.listRecentConversationsForAgent(auth, {
    agentConfigurationId,
    updatedSince,
  });
}

/**
 * Analyze a single conversation for a specific agent.
 */
export async function analyzeConversationActivity({
  workspaceId,
  agentConfigurationId,
  conversationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  conversationId: string;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  await analyzeConversationForReinforcement(auth, {
    conversationId,
    agentConfigurationId,
  });
}

/**
 * Aggregate synthetic suggestions for a specific agent into pending suggestions.
 */
export async function aggregateSuggestionsActivity({
  workspaceId,
  agentConfigurationId,
  disableNotifications,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  disableNotifications: boolean;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  await aggregateSyntheticSuggestions(
    auth,
    agentConfigurationId,
    disableNotifications
  );
}

// ---------------------------------------------------------------------------
// Batch activities
// ---------------------------------------------------------------------------

/**
 * Build analysis prompts for all conversations and submit them as a batch.
 * Returns the batch ID, reinforced agent conversation sIds, and the original
 * conversation sIds being analyzed (to map results back).
 * Returns null if no conversations could be prepared.
 */
export async function startConversationAnalysisBatchActivity({
  workspaceId,
  agentConfigurationId,
  analysedConversationIds,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  analysedConversationIds: string[];
}): Promise<{
  batchId: string;
  reinforcementConversationIds: string[];
  analysedConversationIds: string[];
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const batchMap = await buildConversationAnalysisBatchMap(auth, {
    agentConfigurationId,
    conversationIds: analysedConversationIds,
  });
  if (!batchMap) {
    return null;
  }

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_analyze_conversation"
  );
  if (!llm) {
    return null;
  }

  const batchConversations: LlmConversationOptions[] = [];
  const orderedAnalysedConversationIds: string[] = [];
  for (const [conversationId, llmParams] of batchMap) {
    const { conversation, ...llmParamsWithoutConversation } = llmParams;
    batchConversations.push({
      newMessages: conversation.messages,
      title: reinforcementConversationTitle(
        "reinforced_agent_analyze_conversation",
        conversationId
      ),
      ...llmParamsWithoutConversation,
      ...getReinforcementDefaultOptions(
        "reinforced_agent_analyze_conversation",
        agentConfigurationId
      ),
    });
    orderedAnalysedConversationIds.push(conversationId);
  }

  const result = await sendBatchCallToLlm(auth, llm, batchConversations);
  if (result.isErr()) {
    throw result.error;
  }

  logger.info(
    {
      agentConfigurationId,
      workspaceId,
      batchId: result.value.batchId,
      conversationCount: batchMap.size,
    },
    "ReinforcedAgent: started conversation analysis batch"
  );

  return {
    batchId: result.value.batchId,
    reinforcementConversationIds: result.value.conversationIds,
    analysedConversationIds: orderedAnalysedConversationIds,
  };
}

/**
 * Check the status of a batch.
 */
export async function checkBatchStatusActivity({
  workspaceId,
  batchId,
}: {
  workspaceId: string;
  batchId: string;
}): Promise<BatchStatus> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_analyze_conversation"
  );
  if (!llm) {
    throw ApplicationFailure.nonRetryable(
      "ReinforcedAgent: no LLM available for batch status check"
    );
  }

  return llm.getBatchStatus(batchId);
}

/**
 * Download batch results for conversation analysis and create suggestions.
 * Also stores agent messages in the reinforced agent conversations.
 */
export async function processConversationAnalysisBatchResultActivity({
  workspaceId,
  agentConfigurationId,
  batchId,
  reinforcementConversationIds,
  analysedConversationIds,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  batchId: string;
  reinforcementConversationIds: string[];
  analysedConversationIds: string[];
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "light",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for batch result processing"
    );
    return;
  }

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_analyze_conversation"
  );
  if (!llm) {
    return;
  }

  // Download results and store agent messages in reinforcement conversations.
  const results = await downloadBatchResultFromLlm(
    auth,
    llm,
    batchId,
    reinforcementConversationIds,
    REINFORCEMENT_AGENT_ID
  );

  // Build mapping from reinforcement conversation sIds back to the analysed conversation sIds.
  const reinforcementToAnalysed = new Map<string, string>();
  for (let i = 0; i < reinforcementConversationIds.length; i++) {
    reinforcementToAnalysed.set(
      reinforcementConversationIds[i],
      analysedConversationIds[i]
    );
  }

  // Resolve analysed conversations for FK storage.
  const analysedConversations = await ConversationResource.fetchByIds(
    auth,
    analysedConversationIds
  );
  const conversationById = new Map(
    analysedConversations.map((c) => [c.sId, c])
  );

  let totalCreated = 0;
  for (const [reinforcementConvId, events] of results) {
    const analysedConvId =
      reinforcementToAnalysed.get(reinforcementConvId) ?? reinforcementConvId;
    const createdCount = await processReinforcedEvents({
      auth,
      agentConfig,
      events,
      source: "synthetic",
      operationType: "reinforced_agent_analyze_conversation",
      contextId: analysedConvId,
      conversation: conversationById.get(analysedConvId),
    });
    totalCreated += createdCount;
  }

  logger.info(
    {
      agentConfigurationId,
      batchId,
      conversationCount: results.size,
      suggestionsCreated: totalCreated,
    },
    "ReinforcedAgent: processed conversation analysis batch results"
  );
}

/**
 * Build aggregation prompt and submit it as a batch.
 * Returns the batch ID and reinforced agent conversation sIds,
 * or null if there are no suggestions to aggregate.
 */
export async function startAggregationBatchActivity({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}): Promise<{
  batchId: string;
  reinforcementConversationIds: string[];
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const batchMap = await buildAggregationBatchMap(auth, agentConfigurationId);
  if (!batchMap) {
    return null;
  }

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_aggregate_suggestions"
  );
  if (!llm) {
    return null;
  }

  const batchConversations: LlmConversationOptions[] = [];
  for (const [, llmParams] of batchMap) {
    const { conversation, ...llmParamsWithoutConversation } = llmParams;
    batchConversations.push({
      newMessages: conversation.messages,
      title: reinforcementConversationTitle(
        "reinforced_agent_aggregate_suggestions",
        agentConfigurationId
      ),
      ...llmParamsWithoutConversation,
      ...getReinforcementDefaultOptions(
        "reinforced_agent_aggregate_suggestions",
        agentConfigurationId
      ),
    });
  }

  const sendResult = await sendBatchCallToLlm(auth, llm, batchConversations);
  if (sendResult.isErr()) {
    throw sendResult.error;
  }
  const { batchId, conversationIds } = sendResult.value;

  logger.info(
    {
      agentConfigurationId,
      workspaceId,
      batchId,
    },
    "ReinforcedAgent: started aggregation batch"
  );

  return { batchId, reinforcementConversationIds: conversationIds };
}

/**
 * Download aggregation batch results, create suggestions, and mark synthetic ones as approved.
 * Also stores agent messages in the reinforced agent conversations.
 */
export async function processAggregationBatchResultActivity({
  workspaceId,
  agentConfigurationId,
  batchId,
  reinforcementConversationIds,
  disableNotifications,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  batchId: string;
  reinforcementConversationIds: string[];
  disableNotifications: boolean;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "light",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for aggregation result processing"
    );
    return;
  }

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_aggregate_suggestions"
  );
  if (!llm) {
    return;
  }

  // Download results and store agent messages in reinforcement conversations.
  const results = await downloadBatchResultFromLlm(
    auth,
    llm,
    batchId,
    reinforcementConversationIds,
    REINFORCEMENT_AGENT_ID
  );

  // The aggregation batch has a single entry — get the first result.
  const events = results.values().next().value;

  let createdCount = 0;
  if (events) {
    createdCount = await processReinforcedEvents({
      auth,
      agentConfig,
      events,
      source: "reinforcement",
      operationType: "reinforced_agent_aggregate_suggestions",
      contextId: "n/a",
    });
  }

  if (createdCount > 0 && !disableNotifications) {
    notifyAgentSuggestionsReady(auth, {
      agentConfiguration: agentConfig,
      suggestionCount: createdCount,
    });
  }

  // Mark all synthetic suggestions as approved (consumed by aggregation).
  const syntheticSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      { sources: ["synthetic"], states: ["pending"] }
    );

  await AgentSuggestionResource.bulkUpdateState(
    auth,
    syntheticSuggestions,
    "approved"
  );

  logger.info(
    {
      agentConfigurationId,
      batchId,
      syntheticCount: syntheticSuggestions.length,
      pendingCreated: createdCount,
    },
    "ReinforcedAgent: processed aggregation batch results"
  );
}
