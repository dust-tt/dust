import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { _getAnalystGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/analyst";
import {
  _getClaude3_7GlobalAgent,
  _getClaude3GlobalAgent,
  _getClaude3HaikuGlobalAgent,
  _getClaude3OpusGlobalAgent,
  _getClaude4_5HaikuGlobalAgent,
  _getClaude4_5SonnetGlobalAgent,
  _getClaude4SonnetGlobalAgent,
  _getClaude5SonnetGlobalAgent,
} from "@app/lib/api/assistant/global_agents/configurations/anthropic";
import {
  _getArchivedBrowserSummaryAgent,
  _getDeepDiveGlobalAgent,
  _getDustTaskGlobalAgent,
  _getPlanningAgent,
} from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import {
  _getDustAntGlobalAgent,
  _getDustAntHighGlobalAgent,
  _getDustAntHighOmittedGlobalAgent,
  _getDustAntMediumGlobalAgent,
  _getDustAntMediumOmittedGlobalAgent,
  _getDustAntSonnetEdgeGlobalAgent,
  _getDustAntSonnetEdgeLightGlobalAgent,
  _getDustDeepseekGlobalAgent,
  _getDustEdgeGlobalAgent,
  _getDustGlmGlobalAgent,
  _getDustGlmHighGlobalAgent,
  _getDustGlmMediumGlobalAgent,
  _getDustGlobalAgent,
  _getDustGoogGlobalAgent,
  _getDustGoogHighGlobalAgent,
  _getDustGoogLiteGlobalAgent,
  _getDustGoogMediumGlobalAgent,
  _getDustGoogProGlobalAgent,
  _getDustGoogProHighGlobalAgent,
  _getDustGoogProMediumGlobalAgent,
  _getDustHaikuGlobalAgent,
  _getDustHighGlobalAgent,
  _getDustHighOmittedGlobalAgent,
  _getDustKimiGlobalAgent,
  _getDustKimiHighGlobalAgent,
  _getDustKimiMediumGlobalAgent,
  _getDustLightGlobalAgent,
  _getDustLionelGlobalAgent,
  _getDustLionelHighGlobalAgent,
  _getDustLionelMediumGlobalAgent,
  _getDustMinimaxGlobalAgent,
  _getDustMinimaxHighGlobalAgent,
  _getDustMinimaxMediumGlobalAgent,
  _getDustMistralMediumHighGlobalAgent,
  _getDustMistralMediumNoneGlobalAgent,
  _getDustNextGlobalAgent,
  _getDustNextHighGlobalAgent,
  _getDustNextMediumGlobalAgent,
  _getDustOaiGlobalAgent,
  _getDustOaiHighGlobalAgent,
  _getDustOaiLunaGlobalAgent,
  _getDustOaiLunaHighGlobalAgent,
  _getDustOaiLunaMediumGlobalAgent,
  _getDustOaiMediumGlobalAgent,
  _getDustOaiNanoHighGlobalAgent,
  _getDustOmittedGlobalAgent,
  _getDustPistacheGlobalAgent,
  _getDustPistacheHighGlobalAgent,
  _getDustPistacheMediumGlobalAgent,
  _getDustQuickGlobalAgent,
  _getDustQuickMediumGlobalAgent,
  _getRetiredDustLikeGlobalAgent,
  getCustomModelDustGlobalAgentIndex,
} from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import { _getNoopAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/noop";
import { _getReinforcementGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/reinforcement";
import { _getSidekickGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/sidekick";
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
import { canRoleSeeGlobalAgent } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type { SidekickContext } from "@app/lib/api/assistant/global_agents/sidekick_context";
import { buildSidekickContext } from "@app/lib/api/assistant/global_agents/sidekick_context";
import type {
  MCPServerViewsForGlobalAgentsMap,
  PrefetchedDataSourcesType,
} from "@app/lib/api/assistant/global_agents/tools";
import {
  getDataSourcesAndWorkspaceIdForGlobalAgents,
  getMCPServerViewsForGlobalAgents,
} from "@app/lib/api/assistant/global_agents/tools";
import {
  getEffectiveWhiteListedProviders,
  isProviderWhitelistedForAuth,
} from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getDefaultStreamConfigForAuth } from "@app/lib/model_tiers/enabled_models";
import { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import type {
  AgentConfigurationType,
  AgentFetchVariant,
  GlobalAgentContext,
  GlobalAgentStatus,
} from "@app/types/assistant/agent";
import {
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import { isWorkspaceAnalyticsEnabled } from "@app/types/user";

function getGlobalAgent({
  auth,
  sId,
  preFetchedDataSources,
  globalAgentSettings,
  mcpServerViews,
  sidekickContext,
  hasDeepDive,
  hasSandbox,
  globalAgentContext,
  autoDefaultModelConfig,
  preferSonnet5DefaultModel,
  featureFlags,
  whiteListedProviders,
}: {
  auth: Authenticator;
  sId: string | number;
  preFetchedDataSources: PrefetchedDataSourcesType | null;
  globalAgentSettings: GlobalAgentSettingsModel[];
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
  sidekickContext: SidekickContext | null;
  hasDeepDive: boolean;
  hasSandbox: boolean;
  globalAgentContext?: GlobalAgentContext;
  autoDefaultModelConfig: ModelConfigurationType | null;
  preferSonnet5DefaultModel: boolean;
  featureFlags: WhitelistableFeature[];
  whiteListedProviders: ModelProviderIdType[] | null;
}): AgentConfigurationType | null {
  const settings =
    globalAgentSettings.find((settings) => settings.agentId === sId) ?? null;

  let agentConfiguration: AgentConfigurationType | null = null;

  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      agentConfiguration = _getHelperGlobalAgent({
        auth,
        featureFlags,
        whiteListedProviders,
        mcpServerViews,
      });
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
    case GLOBAL_AGENTS_SID.CLAUDE_5_SONNET:
      agentConfiguration = _getClaude5SonnetGlobalAgent({
        auth,
        settings,
        mcpServerViews,
        featureFlags,
        whiteListedProviders,
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
    case GLOBAL_AGENTS_SID.SLACK:
      agentConfiguration = _getSlackGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      agentConfiguration = _getGoogleDriveGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.NOTION:
      agentConfiguration = _getNotionGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.GITHUB:
      agentConfiguration = _getGithubGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.INTERCOM:
      agentConfiguration = _getIntercomGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST:
      agentConfiguration = _getDustGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
        globalAgentContext,
        autoDefaultModelConfig,
        preferSonnet5DefaultModel,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_HIGH:
      agentConfiguration = _getDustHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
        globalAgentContext,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OMITTED:
      agentConfiguration = _getDustOmittedGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
        globalAgentContext,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_HIGH_OMITTED:
      agentConfiguration = _getDustHighOmittedGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
        globalAgentContext,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_EDGE:
      agentConfiguration = _getDustEdgeGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT:
      agentConfiguration = _getDustAntGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM:
      agentConfiguration = _getDustAntMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_HIGH:
      agentConfiguration = _getDustAntHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM_OMITTED:
      agentConfiguration = _getDustAntMediumOmittedGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_HIGH_OMITTED:
      agentConfiguration = _getDustAntHighOmittedGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_SONNET_EDGE:
      agentConfiguration = _getDustAntSonnetEdgeGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_ANT_SONNET_EDGE_LIGHT:
      agentConfiguration = _getDustAntSonnetEdgeLightGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_HAIKU:
      agentConfiguration = _getDustHaikuGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_LIGHT:
      agentConfiguration = _getDustLightGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_KIMI:
      agentConfiguration = _getDustKimiGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_KIMI_MEDIUM:
      agentConfiguration = _getDustKimiMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_KIMI_HIGH:
      agentConfiguration = _getDustKimiHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GLM:
      agentConfiguration = _getDustGlmGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GLM_MEDIUM:
      agentConfiguration = _getDustGlmMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GLM_HIGH:
      agentConfiguration = _getDustGlmHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_PISTACHE:
      agentConfiguration = _getDustPistacheGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_PISTACHE_MEDIUM:
      agentConfiguration = _getDustPistacheMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_PISTACHE_HIGH:
      agentConfiguration = _getDustPistacheHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MINIMAX:
      agentConfiguration = _getDustMinimaxGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MINIMAX_MEDIUM:
      agentConfiguration = _getDustMinimaxMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MINIMAX_HIGH:
      agentConfiguration = _getDustMinimaxHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_DEEPSEEK:
      agentConfiguration = _getDustDeepseekGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MISTRAL_MEDIUM_NONE:
      agentConfiguration = _getDustMistralMediumNoneGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_MISTRAL_MEDIUM_HIGH:
      agentConfiguration = _getDustMistralMediumHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_QUICK:
      agentConfiguration = _getDustQuickGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI:
      agentConfiguration = _getDustOaiGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI_MEDIUM:
      agentConfiguration = _getDustOaiMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI_HIGH:
      agentConfiguration = _getDustOaiHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI_LUNA:
      agentConfiguration = _getDustOaiLunaGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI_LUNA_MEDIUM:
      agentConfiguration = _getDustOaiLunaMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI_LUNA_HIGH:
      agentConfiguration = _getDustOaiLunaHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_OAI_NANO_HIGH:
      agentConfiguration = _getDustOaiNanoHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG:
      agentConfiguration = _getDustGoogGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG_MEDIUM:
      agentConfiguration = _getDustGoogMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG_HIGH:
      agentConfiguration = _getDustGoogHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG_LITE:
      agentConfiguration = _getDustGoogLiteGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG_PRO:
      agentConfiguration = _getDustGoogProGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG_PRO_MEDIUM:
      agentConfiguration = _getDustGoogProMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_GOOG_PRO_HIGH:
      agentConfiguration = _getDustGoogProHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_QUICK_MEDIUM:
      agentConfiguration = _getDustQuickMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_NEXT:
      agentConfiguration = _getDustNextGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM:
      agentConfiguration = _getDustNextMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_NEXT_HIGH:
      agentConfiguration = _getDustNextHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_LIONEL:
      agentConfiguration = _getDustLionelGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_LIONEL_MEDIUM:
      agentConfiguration = _getDustLionelMediumGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_LIONEL_HIGH:
      agentConfiguration = _getDustLionelHighGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasDeepDive,
        featureFlags,
        whiteListedProviders,
      });
      break;
    // Retired custom-model dust-* agents: their eval models were removed from
    // the infra config, so they resolve to a fallback model for past
    // conversations only (see RETIRED_GLOBAL_AGENTS_SID).
    case GLOBAL_AGENTS_SID.DUST_SUNDAE:
    case GLOBAL_AGENTS_SID.DUST_SUNDAE_MEDIUM:
    case GLOBAL_AGENTS_SID.DUST_SUNDAE_HIGH:
    case GLOBAL_AGENTS_SID.DUST_CHALOM:
    case GLOBAL_AGENTS_SID.DUST_CHALOM_MEDIUM:
    case GLOBAL_AGENTS_SID.DUST_CHALOM_HIGH:
    case GLOBAL_AGENTS_SID.DUST_SOUPINOU:
    case GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM:
    case GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH:
    case GLOBAL_AGENTS_SID.DUST_SOUPINOU_NONE:
    case GLOBAL_AGENTS_SID.DUST_CHAWI:
    case GLOBAL_AGENTS_SID.DUST_CHAWI_MEDIUM:
    case GLOBAL_AGENTS_SID.DUST_CHAWI_HIGH:
      agentConfiguration = _getRetiredDustLikeGlobalAgent(
        auth,
        {
          settings,
          preFetchedDataSources,
          mcpServerViews,
          hasDeepDive,
          featureFlags,
          whiteListedProviders,
        },
        sId
      );
      break;
    case GLOBAL_AGENTS_SID.DEEP_DIVE:
      agentConfiguration = _getDeepDiveGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        hasSandbox,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_TASK:
      agentConfiguration = _getDustTaskGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        mcpServerViews,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY:
      agentConfiguration = _getArchivedBrowserSummaryAgent();
      break;
    case GLOBAL_AGENTS_SID.DUST_PLANNING:
      agentConfiguration = _getPlanningAgent(auth, {
        settings,
        featureFlags,
        whiteListedProviders,
      });
      break;
    case GLOBAL_AGENTS_SID.SIDEKICK:
      agentConfiguration = _getSidekickGlobalAgent(auth, {
        sidekickContext,
        preFetchedDataSources,
        mcpServerViews,
        globalAgentContext,
        featureFlags,
      });
      break;
    case GLOBAL_AGENTS_SID.REINFORCEMENT:
      agentConfiguration = _getReinforcementGlobalAgent();
      break;
    case GLOBAL_AGENTS_SID.ANALYST:
      agentConfiguration = _getAnalystGlobalAgent({ auth });
      break;
    case GLOBAL_AGENTS_SID.NOOP:
      agentConfiguration = _getNoopAgent();
      break;
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
  GLOBAL_AGENTS_SID.CLAUDE_4_5_SONNET,
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
  GLOBAL_AGENTS_SID.O1,
  GLOBAL_AGENTS_SID.O1_HIGH_REASONING,
  GLOBAL_AGENTS_SID.O1_MINI,
  GLOBAL_AGENTS_SID.O3,
  GLOBAL_AGENTS_SID.O3_MINI,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.SLACK,
  // Hidden helper sub-agent, only invoked via run_agent by deep-dive
  GLOBAL_AGENTS_SID.DUST_TASK,
  GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY,
  GLOBAL_AGENTS_SID.DUST_PLANNING,
  GLOBAL_AGENTS_SID.DUST_NEXT,
  GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM,
  GLOBAL_AGENTS_SID.DUST_NEXT_HIGH,
  GLOBAL_AGENTS_SID.DUST_QUICK,
  GLOBAL_AGENTS_SID.DUST_QUICK_MEDIUM,
  GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM_OMITTED,
  GLOBAL_AGENTS_SID.DUST_ANT_HIGH_OMITTED,
  // Custom-model dust-* agents whose eval models were removed from the infra
  // config. Kept callable for past conversations; may be revived in the future.
  GLOBAL_AGENTS_SID.DUST_SUNDAE,
  GLOBAL_AGENTS_SID.DUST_SUNDAE_MEDIUM,
  GLOBAL_AGENTS_SID.DUST_SUNDAE_HIGH,
  GLOBAL_AGENTS_SID.DUST_CHALOM,
  GLOBAL_AGENTS_SID.DUST_CHALOM_MEDIUM,
  GLOBAL_AGENTS_SID.DUST_CHALOM_HIGH,
  GLOBAL_AGENTS_SID.DUST_SOUPINOU,
  GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM,
  GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH,
  GLOBAL_AGENTS_SID.DUST_SOUPINOU_NONE,
  GLOBAL_AGENTS_SID.DUST_CHAWI,
  GLOBAL_AGENTS_SID.DUST_CHAWI_MEDIUM,
  GLOBAL_AGENTS_SID.DUST_CHAWI_HIGH,
];

// Retired global agents remain resolvable internally (to keep past conversations running) but
// must not be surfaced to users/integrations. `getGlobalAgents` already filters them out of list
// views; callers that fetch a specific agent by sId should use this to gate the public response.
export function isRetiredGlobalAgent(sId: string): boolean {
  return isGlobalAgentId(sId) && RETIRED_GLOBAL_AGENTS_SID.includes(sId);
}

const MODEL_ONLY_GLOBAL_AGENTS_SID: readonly GLOBAL_AGENTS_SID[] = [
  GLOBAL_AGENTS_SID.GPT35_TURBO,
  GLOBAL_AGENTS_SID.GPT4,
  GLOBAL_AGENTS_SID.GPT5,
  GLOBAL_AGENTS_SID.GPT5_THINKING,
  GLOBAL_AGENTS_SID.GPT5_NANO,
  GLOBAL_AGENTS_SID.GPT5_MINI,
  GLOBAL_AGENTS_SID.O1,
  GLOBAL_AGENTS_SID.O1_MINI,
  GLOBAL_AGENTS_SID.O1_HIGH_REASONING,
  GLOBAL_AGENTS_SID.O3_MINI,
  GLOBAL_AGENTS_SID.O3,
  GLOBAL_AGENTS_SID.CLAUDE_5_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_4_5_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_4_5_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_4_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
  GLOBAL_AGENTS_SID.MISTRAL_LARGE,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.GEMINI_PRO,
];

function getCustomModelIndexForGlobalAgent(sId: string): number | null {
  if (!isGlobalAgentId(sId)) {
    return null;
  }

  return getCustomModelDustGlobalAgentIndex(sId);
}

export async function getGlobalAgents(
  auth: Authenticator,
  agentIds?: string[],
  variant: AgentFetchVariant = "full",
  options?: { globalAgentContext?: GlobalAgentContext }
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
    isDeepDiveDisabled,
    preFetchedDataSources,
    globalAgentSettings,
    mcpServerViews,
  ] = await Promise.all([
    isDeepDiveDisabledByAdmin(auth),
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
      // We only want to fetch sidekick global agents if explicitly requested.
      .filter((sId) => sId !== GLOBAL_AGENTS_SID.SIDEKICK)
      // The reinforcement agent is never called directly, it is only used as a
      // placeholder when building reinforcement conversations.
      .filter((sId) => sId !== GLOBAL_AGENTS_SID.REINFORCEMENT);

  const flags = await getFeatureFlags(auth);
  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);

  if (!isWorkspaceAnalyticsEnabled(owner)) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.ANALYST
    );
  }

  if (agentIds === undefined) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) =>
        !isGlobalAgentId(sId) || !MODEL_ONLY_GLOBAL_AGENTS_SID.includes(sId)
    );
  }
  const DUST_INTERNAL_AGENTS: readonly GLOBAL_AGENTS_SID[] = [
    GLOBAL_AGENTS_SID.DUST_HIGH,
    GLOBAL_AGENTS_SID.DUST_OMITTED,
    GLOBAL_AGENTS_SID.DUST_HIGH_OMITTED,
    GLOBAL_AGENTS_SID.DUST_ANT,
    GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_ANT_HIGH,
    GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM_OMITTED,
    GLOBAL_AGENTS_SID.DUST_ANT_HIGH_OMITTED,
    GLOBAL_AGENTS_SID.DUST_ANT_SONNET_EDGE,
    GLOBAL_AGENTS_SID.DUST_ANT_SONNET_EDGE_LIGHT,
    GLOBAL_AGENTS_SID.DUST_HAIKU,
    GLOBAL_AGENTS_SID.DUST_LIGHT,
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
    GLOBAL_AGENTS_SID.DUST_DEEPSEEK,
    GLOBAL_AGENTS_SID.DUST_MISTRAL_MEDIUM_NONE,
    GLOBAL_AGENTS_SID.DUST_MISTRAL_MEDIUM_HIGH,
    GLOBAL_AGENTS_SID.DUST_QUICK,
    GLOBAL_AGENTS_SID.DUST_QUICK_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_OAI,
    GLOBAL_AGENTS_SID.DUST_OAI_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_OAI_HIGH,
    GLOBAL_AGENTS_SID.DUST_OAI_LUNA,
    GLOBAL_AGENTS_SID.DUST_OAI_LUNA_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_OAI_LUNA_HIGH,
    GLOBAL_AGENTS_SID.DUST_OAI_NANO_HIGH,
    GLOBAL_AGENTS_SID.DUST_GOOG,
    GLOBAL_AGENTS_SID.DUST_GOOG_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_GOOG_HIGH,
    GLOBAL_AGENTS_SID.DUST_GOOG_LITE,
    GLOBAL_AGENTS_SID.DUST_GOOG_PRO,
    GLOBAL_AGENTS_SID.DUST_GOOG_PRO_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_GOOG_PRO_HIGH,
    GLOBAL_AGENTS_SID.DUST_NEXT,
    GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_NEXT_HIGH,
    GLOBAL_AGENTS_SID.DUST_CHAWI,
    GLOBAL_AGENTS_SID.DUST_CHAWI_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_CHAWI_HIGH,
    GLOBAL_AGENTS_SID.DUST_SOUPINOU,
    GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH,
    GLOBAL_AGENTS_SID.DUST_SOUPINOU_NONE,
    GLOBAL_AGENTS_SID.DUST_SUNDAE,
    GLOBAL_AGENTS_SID.DUST_SUNDAE_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_SUNDAE_HIGH,
    GLOBAL_AGENTS_SID.DUST_PISTACHE,
    GLOBAL_AGENTS_SID.DUST_PISTACHE_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_PISTACHE_HIGH,
    GLOBAL_AGENTS_SID.DUST_CHALOM,
    GLOBAL_AGENTS_SID.DUST_CHALOM_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_CHALOM_HIGH,
    GLOBAL_AGENTS_SID.DUST_LIONEL,
    GLOBAL_AGENTS_SID.DUST_LIONEL_MEDIUM,
    GLOBAL_AGENTS_SID.DUST_LIONEL_HIGH,
    GLOBAL_AGENTS_SID.NOOP,
  ];
  if (!flags.includes("dust_internal_global_agents")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => !isGlobalAgentId(sId) || !DUST_INTERNAL_AGENTS.includes(sId)
    );
  }

  if (!flags.includes("custom_model_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => getCustomModelIndexForGlobalAgent(sId) === null
    );
  }

  agentsIdsToFetch = agentsIdsToFetch.filter((sId) => {
    const customModelIndex = getCustomModelIndexForGlobalAgent(sId);
    if (customModelIndex === null) {
      return true;
    }

    const customModel = CUSTOM_MODEL_CONFIGS[customModelIndex];
    if (!customModel) {
      return false;
    }

    const customModelFlag = customModel.availableIfOneOf?.featureFlag;

    return !customModelFlag || flags.includes(customModelFlag);
  });

  agentsIdsToFetch = agentsIdsToFetch.filter(
    (sId) => !isGlobalAgentId(sId) || canRoleSeeGlobalAgent(sId, auth)
  );

  const sidekickContext =
    variant === "full"
      ? await buildSidekickContext(auth, agentsIdsToFetch)
      : null;

  const autoDefaultModelConfig = await getDefaultStreamConfigForAuth(auth);

  // For now we retrieve them all
  // We will store them in the database later to allow admin enable them or not
  const agentCandidates = agentsIdsToFetch.map((sId) =>
    getGlobalAgent({
      auth,
      sId,
      preFetchedDataSources,
      globalAgentSettings,
      mcpServerViews,
      sidekickContext,
      hasDeepDive: !isDeepDiveDisabled,
      hasSandbox: isComputerFeatureEnabled(flags),
      globalAgentContext: options?.globalAgentContext,
      autoDefaultModelConfig,
      preferSonnet5DefaultModel: flags.includes("dust_agent_sonnet_5_default"),
      featureFlags: flags,
      whiteListedProviders,
    })
  );

  const globalAgents: AgentConfigurationType[] = [];

  for (const agentFetcherResult of agentCandidates) {
    if (
      agentFetcherResult &&
      agentFetcherResult.scope === "global" &&
      isProviderWhitelistedForAuth(
        auth,
        agentFetcherResult.model.providerId,
        whiteListedProviders
      )
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
