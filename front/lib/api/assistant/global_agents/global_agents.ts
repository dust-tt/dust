import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import {
  _getClaude2GlobalAgent,
  _getClaude3_7GlobalAgent,
  _getClaude3GlobalAgent,
  _getClaude3HaikuGlobalAgent,
  _getClaude3OpusGlobalAgent,
  _getClaude4SonnetGlobalAgent,
  _getClaudeInstantGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/anthropic";
import { _getDeepSeekR1GlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/deepseek";
import { _getDustGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust";
import { _getGeminiProGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/google";
import {
  _getHelperGlobalAgent,
  HelperAssistantPrompt,
} from "@app/lib/api/assistant/global_agents/configurations/helper";
import {
  _getMistralLargeGlobalAgent,
  _getMistralMediumGlobalAgent,
  _getMistralSmallGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/mistral";
import {
  _getGPT4GlobalAgent,
  _getGPT35TurboGlobalAgent,
  _getO1GlobalAgent,
  _getO1HighReasoningGlobalAgent,
  _getO1MiniGlobalAgent,
  _getO3GlobalAgent,
  _getO3MiniGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/openai";
import {
  _getGithubGlobalAgent,
  _getGoogleDriveGlobalAgent,
  _getIntercomGlobalAgent,
  _getNotionGlobalAgent,
  _getSlackGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/retired_managed";
import type { PrefetchedDataSourcesType } from "@app/lib/api/assistant/global_agents/tools";
import { getDataSourcesAndWorkspaceIdForGlobalAgents } from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationType,
  AgentFetchVariant,
  GlobalAgentStatus,
} from "@app/types";
import {
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
  isProviderWhitelisted,
} from "@app/types";

function getGlobalAgent({
  auth,
  sId,
  preFetchedDataSources,
  helperPromptInstance,
  globalAgentSettings,
  agentRouterMCPServerView,
  webSearchBrowseMCPServerView,
  searchMCPServerView,
}: {
  auth: Authenticator;
  sId: string | number;
  preFetchedDataSources: PrefetchedDataSourcesType | null;
  helperPromptInstance: HelperAssistantPrompt;
  globalAgentSettings: GlobalAgentSettings[];
  agentRouterMCPServerView: MCPServerViewResource | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  searchMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType | null {
  const settings =
    globalAgentSettings.find((settings) => settings.agentId === sId) ?? null;

  let agentConfiguration: AgentConfigurationType | null = null;
  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      agentConfiguration = _getHelperGlobalAgent({
        auth,
        helperPromptInstance,
        agentRouterMCPServerView,
        webSearchBrowseMCPServerView,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      agentConfiguration = _getGPT35TurboGlobalAgent({
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT4:
      agentConfiguration = _getGPT4GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O1:
      agentConfiguration = _getO1GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O1_MINI:
      agentConfiguration = _getO1MiniGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
      agentConfiguration = _getO1HighReasoningGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O3_MINI:
      agentConfiguration = _getO3MiniGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O3:
      agentConfiguration = _getO3GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      agentConfiguration = _getClaudeInstantGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_4_SONNET:
      agentConfiguration = _getClaude4SonnetGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
      agentConfiguration = _getClaude3OpusGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
      agentConfiguration = _getClaude3GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
      agentConfiguration = _getClaude3HaikuGlobalAgent({
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
      agentConfiguration = _getClaude3_7GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      agentConfiguration = _getClaude2GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
      agentConfiguration = _getMistralLargeGlobalAgent({
        settings,
        auth,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
      agentConfiguration = _getMistralMediumGlobalAgent({
        settings,
        auth,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      agentConfiguration = _getMistralSmallGlobalAgent({
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      agentConfiguration = _getGeminiProGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      agentConfiguration = _getDeepSeekR1GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.SLACK:
      agentConfiguration = _getSlackGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      agentConfiguration = _getGoogleDriveGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.NOTION:
      agentConfiguration = _getNotionGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GITHUB:
      agentConfiguration = _getGithubGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.INTERCOM:
      agentConfiguration = _getIntercomGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST:
      agentConfiguration = _getDustGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        agentRouterMCPServerView,
        webSearchBrowseMCPServerView,
        searchMCPServerView,
      });
      break;
    default:
      return null;
  }

  return agentConfiguration;
}

// This is the list of global agents that we want to support in past conversations but we don't want
// to be accessible to users moving forward.
const RETIRED_GLOBAL_AGENTS_SID = [
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GPT35_TURBO,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.O1_MINI,
  GLOBAL_AGENTS_SID.SLACK,
];

export async function getGlobalAgents(
  auth: Authenticator,
  agentIds?: string[],
  variant: AgentFetchVariant = "full"
): Promise<AgentConfigurationType[]> {
  if (agentIds !== undefined && agentIds.some((sId) => !isGlobalAgentId(sId))) {
    throw new Error("Invalid agentIds.");
  }

  if (agentIds !== undefined && agentIds.length === 0) {
    return [];
  }

  const owner = auth.getNonNullableWorkspace();

  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }

  const [
    preFetchedDataSources,
    globalAgentSettings,
    helperPromptInstance,
    agentRouterMCPServerView,
    webSearchBrowseMCPServerView,
    searchMCPServerView,
  ] = await Promise.all([
    variant === "full"
      ? getDataSourcesAndWorkspaceIdForGlobalAgents(auth)
      : null,
    GlobalAgentSettings.findAll({
      where: { workspaceId: owner.id },
    }),
    HelperAssistantPrompt.getInstance(),
    variant === "full"
      ? MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "agent_router"
        )
      : null,
    variant === "full"
      ? MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "web_search_&_browse"
        )
      : null,
    variant === "full"
      ? MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "search"
        )
      : null,
  ]);

  // If agentIds have been passed we fetch those. Otherwise we fetch them all, removing the retired
  // one (which will remove these models from the list of default agents in the product + list of
  // user agents).
  let agentsIdsToFetch =
    agentIds ??
    Object.values(GLOBAL_AGENTS_SID).filter(
      (sId) => !RETIRED_GLOBAL_AGENTS_SID.includes(sId)
    );

  const flags = await getFeatureFlags(owner);

  if (!flags.includes("openai_o1_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O1
    );
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O3
    );
  }
  if (!flags.includes("openai_o1_high_reasoning_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O1_HIGH_REASONING
    );
  }
  if (!flags.includes("deepseek_r1_global_agent_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.DEEPSEEK_R1
    );
  }

  // For now we retrieve them all
  // We will store them in the database later to allow admin enable them or not
  const agentCandidates = agentsIdsToFetch.map((sId) =>
    getGlobalAgent({
      auth,
      sId,
      preFetchedDataSources,
      helperPromptInstance,
      globalAgentSettings,
      agentRouterMCPServerView,
      webSearchBrowseMCPServerView,
      searchMCPServerView,
    })
  );

  const globalAgents: AgentConfigurationType[] = [];

  for (const agentFetcherResult of agentCandidates) {
    if (
      agentFetcherResult &&
      agentFetcherResult.scope === "global" &&
      isProviderWhitelisted(owner, agentFetcherResult.model.providerId)
    ) {
      globalAgents.push(agentFetcherResult);
    }
  }

  // add user's favorite status to the agents if needed
  const user = auth.user();
  if (user) {
    const favoriteStates = await getFavoriteStates(auth, {
      configurationIds: globalAgents.map((agent) => agent.sId),
    });

    for (const agent of globalAgents) {
      agent.userFavorite = !!favoriteStates.get(agent.sId);
    }
  }

  return globalAgents;
}

export async function upsertGlobalAgentSettings(
  auth: Authenticator,
  {
    agentId,
    status,
  }: {
    agentId: string;
    status: GlobalAgentStatus;
  }
): Promise<boolean> {
  const owner = auth.getNonNullableWorkspace();

  if (!isGlobalAgentId(agentId)) {
    throw new Error("Global Agent not found: invalid agentId.");
  }

  const settings = await GlobalAgentSettings.findOne({
    where: { workspaceId: owner.id, agentId },
  });

  if (settings) {
    await settings.update({ status });
  } else {
    await GlobalAgentSettings.create({
      workspaceId: owner.id,
      agentId,
      status,
    });
  }

  return true;
}
