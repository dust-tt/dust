import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { aggregateSyntheticSuggestions } from "@app/lib/reinforced_agent/aggregate_suggestions";
import { analyzeConversationForReinforcement } from "@app/lib/reinforced_agent/analyze_conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ApplicationFailure } from "@temporalio/common";

const HOURS_LOOKBACK = 24;

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
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
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
    dangerouslySkipPermissionFiltering: true,
  });

  return agents.filter((a) => a.id > 0).map((a) => a.sId);
}

/**
 * List recent conversation sIds that involved a specific agent.
 */
export async function getRecentConversationsForAgentActivity({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}): Promise<string[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const updatedSince = new Date();
  updatedSince.setHours(updatedSince.getHours() - HOURS_LOOKBACK);

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
}: {
  workspaceId: string;
  agentConfigurationId: string;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  await aggregateSyntheticSuggestions(auth, agentConfigurationId);
}
