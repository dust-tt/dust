import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { buildCopilotInstructions } from "@app/lib/api/assistant/global_agents/configurations/dust/copilot";
import type { CopilotContext } from "@app/lib/api/assistant/global_agents/copilot_context";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type {
  MCPServerViewsForGlobalAgentsMap,
  PrefetchedDataSourcesType,
} from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { getCompanyDataAction } from "./shared";

export function _getCopilotEdgeGlobalAgent(
  auth: Authenticator,
  {
    copilotContext,
    preFetchedDataSources,
    mcpServerViews,
  }: {
    copilotContext: CopilotContext | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    mcpServerViews: MCPServerViewsForGlobalAgentsMap;
  }
): AgentConfigurationType {
  const companyDataAction = getCompanyDataAction(
    preFetchedDataSources,
    mcpServerViews
  );

  const contextAction = copilotContext?.mcpServerViews?.context
    ? buildServerSideMCPServerConfiguration({
        mcpServerView: copilotContext.mcpServerViews.context,
      })
    : null;

  const actions = [
    ...(contextAction ? [contextAction] : []),
    ...(companyDataAction ? [companyDataAction] : []),
  ];

  const langfuseConfig = copilotContext?.langfuseConfig;
  const modelConfiguration =
    langfuseConfig?.modelConfig ?? CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG;

  const model = {
    providerId: modelConfiguration.providerId,
    modelId: modelConfiguration.modelId,
    temperature: 0.7,
    reasoningEffort:
      langfuseConfig?.reasoningEffort ??
      modelConfiguration.maximumReasoningEffort,
  };

  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.COPILOT_EDGE);

  const instructions =
    langfuseConfig?.instructions || buildCopilotInstructions();

  return {
    id: -1,
    sId: metadata.sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions,
    instructionsHtml: null,
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
