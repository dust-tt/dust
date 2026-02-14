import { AGENT_COPILOT_CONTEXT_TOOL_NAME } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import {
  _getClaude3_7GlobalAgent,
  _getClaude3GlobalAgent,
  _getClaude3HaikuGlobalAgent,
  _getClaude3OpusGlobalAgent,
  _getClaude4_5HaikuGlobalAgent,
  _getClaude4_5SonnetGlobalAgent,
  _getClaude4SonnetGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/anthropic";
import { _getDeepSeekR1GlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/deepseek";
import { _getCopilotGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/copilot";
import {
  _getBrowserSummaryAgent,
  _getDeepDiveGlobalAgent,
  _getDustTaskGlobalAgent,
  _getPlanningAgent,
} from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import {
  _getDustAntGlobalAgent,
  _getDustAntHighGlobalAgent,
  _getDustAntMediumGlobalAgent,
  _getDustEdgeGlobalAgent,
  _getDustGlmGlobalAgent,
  _getDustGlmHighGlobalAgent,
  _getDustGlmMediumGlobalAgent,
  _getDustGlobalAgent,
  _getDustGoogGlobalAgent,
  _getDustGoogMediumGlobalAgent,
  _getDustKimiGlobalAgent,
  _getDustKimiHighGlobalAgent,
  _getDustKimiMediumGlobalAgent,
  _getDustMinimaxGlobalAgent,
  _getDustMinimaxHighGlobalAgent,
  _getDustMinimaxMediumGlobalAgent,
  _getDustNextGlobalAgent,
  _getDustNextHighGlobalAgent,
  _getDustNextMediumGlobalAgent,
  _getDustOaiGlobalAgent,
  _getDustQuickGlobalAgent,
  _getDustQuickMediumGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import { _getNoopAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/noop";
import { isDeepDiveDisabledByAdmin } from "@app/lib/api/assistant/global_agents/configurations/dust/utils";
import { _getGeminiProGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/google";
import { _getHelperGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/helper";
import {
  _getMistralLargeGlobalAgent,
  _getMistralMediumGlobalAgent,
  _getMistralSmallGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/mistral";
import {
  _getGPT4GlobalAgent,
  _getGPT5GlobalAgent,
  _getGPT5MiniGlobalAgent,
  _getGPT5NanoGlobalAgent,
  _getGPT5ThinkingGlobalAgent,
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
import type {
  MCPServerViewsForGlobalAgentsMap,
  PrefetchedDataSourcesType,
} from "@app/lib/api/assistant/global_agents/tools";
import {
  getDataSourcesAndWorkspaceIdForGlobalAgents,
  getMCPServerViewsForGlobalAgents,
} from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationType,
  AgentFetchVariant,
  GlobalAgentStatus,
} from "@app/types/assistant/agent";
import {
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import { isProviderWhitelisted } from "@app/types/assistant/models/providers";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { isFavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { isJobType } from "@app/types/job_type";
import { isDevelopment } from "@app/types/shared/env";
import { isStringArray } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// Exhaustive map of flags for each global agent. This is used to control which agents inject
// per-user dynamic content (like memories) into the prompt context. This approach is not ideal but
// allows us to move dynamic content out of instructions and into context sections, improving prompt
// cache hit rates. Will be properly refactored if we manage to improve cache hit rates.
const GLOBAL_AGENT_FLAGS: Record<
  GLOBAL_AGENTS_SID,
  { injectsMemory: boolean; injectsToolsets: boolean }
> = {
  [GLOBAL_AGENTS_SID.DUST]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_EDGE]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_QUICK]: {
    injectsMemory: true,
    injectsToolsets: true,
  },
  [GLOBAL_AGENTS_SID.DUST_QUICK_MEDIUM]: {
    injectsMemory: true,
    injectsToolsets: true,
  },
  [GLOBAL_AGENTS_SID.DUST_OAI]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_GOOG]: {
    injectsMemory: true,
    injectsToolsets: true,
  },
  [GLOBAL_AGENTS_SID.DUST_GOOG_MEDIUM]: {
    injectsMemory: true,
    injectsToolsets: true,
  },
  [GLOBAL_AGENTS_SID.DUST_ANT]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_ANT_HIGH]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_KIMI]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_KIMI_MEDIUM]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_KIMI_HIGH]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_GLM]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_GLM_MEDIUM]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_GLM_HIGH]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_MINIMAX]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_MINIMAX_MEDIUM]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_MINIMAX_HIGH]: { injectsMemory: true, injectsToolsets: true },
  [GLOBAL_AGENTS_SID.DUST_NEXT]: {
    injectsMemory: true,
    injectsToolsets: true,
  },
  [GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM]: {
    injectsMemory: true,
    injectsToolsets: true,
  },
  [GLOBAL_AGENTS_SID.DUST_NEXT_HIGH]: {
    injectsMemory: true,
    injectsToolsets: true,
  },
  [GLOBAL_AGENTS_SID.HELPER]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.DEEP_DIVE]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.DUST_TASK]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.DUST_PLANNING]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.COPILOT]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.SLACK]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.GOOGLE_DRIVE]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.NOTION]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.GITHUB]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.INTERCOM]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.GPT35_TURBO]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.GPT4]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.GPT5]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.GPT5_THINKING]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.GPT5_NANO]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.GPT5_MINI]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.O1]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.O1_MINI]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.O1_HIGH_REASONING]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.O3_MINI]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.O3]: { injectsMemory: false, injectsToolsets: false },
  [GLOBAL_AGENTS_SID.CLAUDE_4_5_HAIKU]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.CLAUDE_4_5_SONNET]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.CLAUDE_4_SONNET]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.CLAUDE_3_OPUS]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.CLAUDE_3_SONNET]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.MISTRAL_LARGE]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.MISTRAL_MEDIUM]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.MISTRAL_SMALL]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.GEMINI_PRO]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.DEEPSEEK_R1]: {
    injectsMemory: false,
    injectsToolsets: false,
  },
  [GLOBAL_AGENTS_SID.NOOP]: { injectsMemory: false, injectsToolsets: false },
};

export function globalAgentInjectsMemory(sId: string): boolean {
  return isGlobalAgentId(sId) && GLOBAL_AGENT_FLAGS[sId].injectsMemory;
}

export function globalAgentInjectsToolsets(sId: string): boolean {
  return isGlobalAgentId(sId) && GLOBAL_AGENT_FLAGS[sId].injectsToolsets;
}

export function isDustLikeAgent(sId: string): boolean {
  return isGlobalAgentId(sId) && GLOBAL_AGENT_FLAGS[sId].injectsMemory;
}

export interface CopilotUserMetadata {
  jobType: JobType | null;
  favoritePlatforms: FavoritePlatform[];
}

async function fetchCopilotUserMetadata(
  auth: Authenticator
): Promise<CopilotUserMetadata | null> {
  const user = auth.user();
  if (!user) {
    return null;
  }

  const owner = auth.getNonNullableWorkspace();

  const [jobTypeMeta, platformsMeta] = await Promise.all([
    // Job type is user-scoped (not workspace-specific).
    user.getMetadata("job_type"),
    user.getMetadata("favorite_platforms", owner.id),
  ]);

  let favoritePlatforms: FavoritePlatform[] = [];
  if (platformsMeta?.value) {
    const parsed = safeParseJSON(platformsMeta.value);
    if (
      parsed.isOk() &&
      isStringArray(parsed.value) &&
      parsed.value.every(isFavoritePlatform)
    ) {
      favoritePlatforms = parsed.value;
    }
  }

  const jobType = isJobType(jobTypeMeta?.value) ? jobTypeMeta.value : null;

  return { jobType, favoritePlatforms };
}

function getGlobalAgent({
  auth,
  sId,
  preFetchedDataSources,
  globalAgentSettings,
  mcpServerViews,
  copilotMCPServerViews,
  copilotUserMetadata,
  hasDeepDive,
}: {
  auth: Authenticator;
  sId: string | number;
  preFetchedDataSources: PrefetchedDataSourcesType | null;
  globalAgentSettings: GlobalAgentSettingsModel[];
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
  copilotMCPServerViews: {
    context: MCPServerViewResource;
  } | null;
  copilotUserMetadata: CopilotUserMetadata | null;
  hasDeepDive: boolean;
}): AgentConfigurationType | null {
  const settings =
    globalAgentSettings.find((settings) => settings.agentId === sId) ?? null;

  let agentConfiguration: AgentConfigurationType | null = null;

  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      agentConfiguration = _getHelperGlobalAgent({ auth, mcpServerViews });
      break;
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      agentConfiguration = _getGPT35TurboGlobalAgent({
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT4:
      agentConfiguration = _getGPT4GlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT5:
      agentConfiguration = _getGPT5GlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT5_NANO:
      agentConfiguration = _getGPT5NanoGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT5_MINI:
      agentConfiguration = _getGPT5MiniGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT5_THINKING:
      agentConfiguration = _getGPT5ThinkingGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.O1:
      agentConfiguration = _getO1GlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.O1_MINI:
      agentConfiguration = _getO1MiniGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
      agentConfiguration = _getO1HighReasoningGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.O3_MINI:
      agentConfiguration = _getO3MiniGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.O3:
      agentConfiguration = _getO3GlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_4_5_SONNET:
      agentConfiguration = _getClaude4_5SonnetGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_4_5_HAIKU:
      agentConfiguration = _getClaude4_5HaikuGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_4_SONNET:
      agentConfiguration = _getClaude4SonnetGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
      agentConfiguration = _getClaude3OpusGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
      agentConfiguration = _getClaude3GlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
      agentConfiguration = _getClaude3HaikuGlobalAgent({
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
      agentConfiguration = _getClaude3_7GlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
      agentConfiguration = _getMistralLargeGlobalAgent({
        settings,
        auth,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
      agentConfiguration = _getMistralMediumGlobalAgent({
        settings,
        auth,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      agentConfiguration = _getMistralSmallGlobalAgent({
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      agentConfiguration = _getGeminiProGlobalAgent({
        auth,
        settings,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      agentConfiguration = _getDeepSeekR1GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.SLACK:
      agentConfiguration = _getSlackGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      agentConfiguration = _getGoogleDriveGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.NOTION:
      agentConfiguration = _getNotionGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.GITHUB:
      agentConfiguration = _getGithubGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.INTERCOM:
      agentConfiguration = _getIntercomGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST:
      agentConfiguration = _getDustGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_EDGE:
      agentConfiguration = _getDustEdgeGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT:
      agentConfiguration = _getDustAntGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM:
      agentConfiguration = _getDustAntMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_HIGH:
      agentConfiguration = _getDustAntHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_KIMI:
      agentConfiguration = _getDustKimiGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_KIMI_MEDIUM:
      agentConfiguration = _getDustKimiMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_KIMI_HIGH:
      agentConfiguration = _getDustKimiHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GLM:
      agentConfiguration = _getDustGlmGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GLM_MEDIUM:
      agentConfiguration = _getDustGlmMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GLM_HIGH:
      agentConfiguration = _getDustGlmHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MINIMAX:
      agentConfiguration = _getDustMinimaxGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MINIMAX_MEDIUM:
      agentConfiguration = _getDustMinimaxMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MINIMAX_HIGH:
      agentConfiguration = _getDustMinimaxHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        availableToolsets,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_QUICK:
      agentConfiguration = _getDustQuickGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI:
      agentConfiguration = _getDustOaiGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG:
      agentConfiguration = _getDustGoogGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG_MEDIUM:
      agentConfiguration = _getDustGoogMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_QUICK_MEDIUM:
      agentConfiguration = _getDustQuickMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_NEXT:
      agentConfiguration = _getDustNextGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM:
      agentConfiguration = _getDustNextMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_NEXT_HIGH:
      agentConfiguration = _getDustNextHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
      });
      break;
    case GLOBAL_AGENTS_SID.DEEP_DIVE:
      agentConfiguration = _getDeepDiveGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_TASK:
      agentConfiguration = _getDustTaskGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY:
      agentConfiguration = _getBrowserSummaryAgent(auth, {
        settings,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_PLANNING:
      agentConfiguration = _getPlanningAgent(auth, {
        settings,
      });
      break;
    case GLOBAL_AGENTS_SID.COPILOT:
      agentConfiguration = _getCopilotGlobalAgent(auth, {
        copilotMCPServerViews,
        copilotUserMetadata,
      });
      break;
    case GLOBAL_AGENTS_SID.NOOP:
      // we want only to have it in development
      if (isDevelopment()) {
        agentConfiguration = _getNoopAgent();
        break;
      }
      return null;
    default:
      return null;
  }

  // TODO(2025-10-20 flav): Remove once SDK JS does not rely on it anymore.
  if (agentConfiguration) {
    agentConfiguration.visualizationEnabled = false;
  }

  return agentConfiguration;
}

// This is the list of global agents that we want to support in past conversations but we don't want
// to be accessible to users moving forward.
const RETIRED_GLOBAL_AGENTS_SID = [
  GLOBAL_AGENTS_SID.CLAUDE_4_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GPT35_TURBO,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.O1_MINI,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.SLACK,
  // Hidden helper sub-agent, only invoked via run_agent by deep-dive
  GLOBAL_AGENTS_SID.DUST_TASK,
  GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY,
  GLOBAL_AGENTS_SID.DUST_PLANNING,
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

  const isDeepDiveDisabled = await isDeepDiveDisabledByAdmin(auth);

  const [preFetchedDataSources, globalAgentSettings, mcpServerViews] =
    await Promise.all([
      variant === "full"
        ? getDataSourcesAndWorkspaceIdForGlobalAgents(auth)
        : null,
      GlobalAgentSettingsModel.findAll({
        where: { workspaceId: owner.id },
      }),
      getMCPServerViewsForGlobalAgents(auth, variant),
    ]);

  // If agentIds have been passed we fetch those. Otherwise we fetch them all, removing the retired
  // one (which will remove these models from the list of default agents in the product + list of
  // user agents).
  let agentsIdsToFetch =
    agentIds ??
    Object.values(GLOBAL_AGENTS_SID)
      .filter((sId) => !RETIRED_GLOBAL_AGENTS_SID.includes(sId))
      // We only want to fetch copilot global agent if explicitely requested.
      .filter((sId) => sId !== GLOBAL_AGENTS_SID.COPILOT);

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
  const DUST_INTERNAL_AGENTS = [
    GLOBAL_AGENTS_SID.DUST_ANT,
    GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_ANT_HIGH,
    GLOBAL_AGENTS_SID.DUST_EDGE,
    GLOBAL_AGENTS_SID.DUST_KIMI,
    GLOBAL_AGENTS_SID.DUST_KIMI_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_KIMI_HIGH,
    GLOBAL_AGENTS_SID.DUST_GLM,
    GLOBAL_AGENTS_SID.DUST_GLM_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_GLM_HIGH,
    GLOBAL_AGENTS_SID.DUST_MINIMAX,
    GLOBAL_AGENTS_SID.DUST_MINIMAX_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_MINIMAX_HIGH,
    GLOBAL_AGENTS_SID.DUST_QUICK,
    GLOBAL_AGENTS_SID.DUST_QUICK_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_OAI,
    GLOBAL_AGENTS_SID.DUST_GOOG,
    GLOBAL_AGENTS_SID.DUST_GOOG_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_NEXT,
    GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_NEXT_HIGH,
  ];
  if (!flags.includes("dust_internal_global_agents")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => !DUST_INTERNAL_AGENTS.includes(sId as GLOBAL_AGENTS_SID)
    );
  }
  // Also hide dust-next variants if the custom model's own feature flag isn't enabled.
  const customModelFlag = CUSTOM_MODEL_CONFIGS[0]?.featureFlag;
  if (customModelFlag && !flags.includes(customModelFlag)) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) =>
        sId !== GLOBAL_AGENTS_SID.DUST_NEXT &&
        sId !== GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM &&
        sId !== GLOBAL_AGENTS_SID.DUST_NEXT_HIGH
    );
  }
  if (!flags.includes("agent_builder_copilot")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.COPILOT
    );
  }

  let copilotMCPServerViews: {
    context: MCPServerViewResource;
  } | null = null;
  let copilotUserMetadata: CopilotUserMetadata | null = null;
  if (
    variant === "full" &&
    agentsIdsToFetch.includes(GLOBAL_AGENTS_SID.COPILOT)
  ) {
    const [context, userMetadata] = await Promise.all([
      MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        AGENT_COPILOT_CONTEXT_TOOL_NAME
      ),
      fetchCopilotUserMetadata(auth),
    ]);
    if (context) {
      copilotMCPServerViews = { context };
    }
    copilotUserMetadata = userMetadata;
  }

  // For now we retrieve them all
  // We will store them in the database later to allow admin enable them or not
  const agentCandidates = agentsIdsToFetch.map((sId) =>
    getGlobalAgent({
      auth,
      sId,
      preFetchedDataSources,
      globalAgentSettings,
      mcpServerViews,
      copilotMCPServerViews,
      copilotUserMetadata,
      hasDeepDive: !isDeepDiveDisabled,
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

  const settings = await GlobalAgentSettingsModel.findOne({
    where: { workspaceId: owner.id, agentId },
  });

  if (settings) {
    await settings.update({ status });
  } else {
    await GlobalAgentSettingsModel.create({
      workspaceId: owner.id,
      agentId,
      status,
    });
  }

  return true;
}
