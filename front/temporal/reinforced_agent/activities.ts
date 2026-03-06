import { Authenticator } from "@app/lib/auth";
import { aggregateSyntheticSuggestions } from "@app/lib/reinforced_agent/aggregate_suggestions";
import { analyzeConversationForReinforcement } from "@app/lib/reinforced_agent/analyze_conversation";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { heartbeat } from "@temporalio/activity";

const HOURS_LOOKBACK = 24;

/**
 * List all workspace model IDs.
 */
export async function getWorkspacesActivity(): Promise<ModelId[]> {
  return WorkspaceResource.listAllModelIds();
}

/**
 * Find conversations updated in the last 24 hours that have agent messages,
 * and analyze each one to create synthetic suggestions.
 */
export async function analyzeRecentConversationsActivity({
  workspaceId,
}: {
  workspaceId: ModelId;
}): Promise<void> {
  const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
  if (!workspace) {
    logger.error({ workspaceId }, "ReinforcedAgent: workspace not found");
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const updatedSince = new Date();
  updatedSince.setHours(updatedSince.getHours() - HOURS_LOOKBACK);

  const recentConversations =
    await ConversationResource.listRecentConversationsWithAgents(auth, {
      updatedSince,
    });

  if (recentConversations.length === 0) {
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      conversationCount: recentConversations.length,
    },
    "ReinforcedAgent: analyzing recent conversations"
  );

  heartbeat();

  await concurrentExecutor(
    recentConversations,
    async ({ conversationId, agentConfigurationIds }) => {
      for (const agentConfigurationId of agentConfigurationIds) {
        await analyzeConversationForReinforcement(auth, {
          conversationId,
          agentConfigurationId,
        });
      }
      heartbeat();
    },
    { concurrency: 2 }
  );
}

/**
 * For each agent that has synthetic suggestions, aggregate them into
 * user-facing pending suggestions.
 */
export async function aggregateSyntheticSuggestionsActivity({
  workspaceId,
}: {
  workspaceId: ModelId;
}): Promise<void> {
  const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
  if (!workspace) {
    logger.error(
      { workspaceId },
      "ReinforcedAgent: workspace not found for aggregation"
    );
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Fetch all suggestions to find distinct agent config IDs with synthetic suggestions.
  const allSuggestions = await AgentSuggestionResource.listAll(auth);
  const agentIdsWithSynthetic = [
    ...new Set(
      allSuggestions
        .filter((s) => s.source === "synthetic" && s.state === "pending")
        .map((s) => s.agentConfigurationSId)
    ),
  ];

  if (agentIdsWithSynthetic.length === 0) {
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      agentCount: agentIdsWithSynthetic.length,
    },
    "ReinforcedAgent: aggregating synthetic suggestions"
  );

  heartbeat();

  await concurrentExecutor(
    agentIdsWithSynthetic,
    async (agentConfigurationId) => {
      await aggregateSyntheticSuggestions(auth, agentConfigurationId);
      heartbeat();
    },
    { concurrency: 2 }
  );
}
