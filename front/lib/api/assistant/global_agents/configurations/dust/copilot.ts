import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { AgentConfigurationType } from "@app/types";
import {
  getLargeWhitelistedModel,
  GLOBAL_AGENTS_SID,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

interface CopilotMCPServerViews {
  context: MCPServerViewResource;
  agentState: MCPServerViewResource;
}

export function _getCopilotGlobalAgent(
  auth: Authenticator,
  copilotMCPServerViews: CopilotMCPServerViews | null
): AgentConfigurationType {
  const owner = auth.getNonNullableWorkspace();

  const actions = copilotMCPServerViews
    ? [
        buildServerSideMCPServerConfiguration({
          mcpServerView: copilotMCPServerViews.context,
        }),
        buildServerSideMCPServerConfiguration({
          mcpServerView: copilotMCPServerViews.agentState,
        }),
      ]
    : [];

  const modelConfiguration = getLargeWhitelistedModel(owner);
  const model = modelConfiguration
    ? {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: 0.7,
        reasoningEffort: modelConfiguration.defaultReasoningEffort,
      }
    : dummyModelConfiguration;

  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.COPILOT);

  return {
    id: -1,
    sId: metadata.sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.sId,
    description: metadata.description,
    instructions: "", // TODO(copilot 2026-01-21): fill in copilot instructions
    pictureUrl: metadata.pictureUrl,
    status: "active",
    scope: "global",
    userFavorite: false,
    model,
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
