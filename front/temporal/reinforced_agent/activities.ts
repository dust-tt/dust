import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
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
  processReinforcedEvents,
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

  return agents
    .filter((a) => a.id > 0 && a.reinforcement !== "off")
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
 * Returns the batch ID, or null if no conversations could be prepared.
 */
export async function startConversationAnalysisBatchActivity({
  workspaceId,
  agentConfigurationId,
  conversationIds,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  conversationIds: string[];
}): Promise<string | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const batchMap = await buildConversationAnalysisBatchMap(auth, {
    agentConfigurationId,
    conversationIds,
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

  const batchId = await llm.sendBatchProcessing(batchMap);

  logger.info(
    {
      agentConfigurationId,
      workspaceId,
      batchId,
      conversationCount: batchMap.size,
    },
    "ReinforcedAgent: started conversation analysis batch"
  );

  return batchId;
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
 */
export async function processConversationAnalysisBatchResultActivity({
  workspaceId,
  agentConfigurationId,
  batchId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  batchId: string;
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

  const results = await llm.getBatchResult(batchId);

  // Resolve conversation sIds to resources for FK storage.
  const conversationIds = [...results.keys()];
  const conversations = await ConversationResource.fetchByIds(
    auth,
    conversationIds
  );
  const conversationById = new Map(conversations.map((c) => [c.sId, c]));

  let totalCreated = 0;
  for (const [conversationId, events] of results) {
    const createdCount = await processReinforcedEvents({
      auth,
      agentConfig,
      events,
      source: "synthetic",
      operationType: "reinforced_agent_analyze_conversation",
      contextId: conversationId,
      conversation: conversationById.get(conversationId),
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
 * Returns the batch ID, or null if there are no suggestions to aggregate.
 */
export async function startAggregationBatchActivity({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}): Promise<string | null> {
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

  const batchId = await llm.sendBatchProcessing(batchMap);

  logger.info(
    {
      agentConfigurationId,
      workspaceId,
      batchId,
    },
    "ReinforcedAgent: started aggregation batch"
  );

  return batchId;
}

/**
 * Download aggregation batch results, create suggestions, and mark synthetic ones as approved.
 */
export async function processAggregationBatchResultActivity({
  workspaceId,
  agentConfigurationId,
  batchId,
  disableNotifications,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  batchId: string;
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

  const results = await llm.getBatchResult(batchId);
  const events = results.get("aggregation");

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
