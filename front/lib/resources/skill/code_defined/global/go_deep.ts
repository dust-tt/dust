import { getDeepDiveInstructions } from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import { isDeepDiveDisabledByAdmin } from "@app/lib/api/assistant/global_agents/configurations/dust/utils";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SKILL_COMPANY_DATA_SERVER_NAME } from "@app/lib/resources/skill/code_defined/shared";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

export const goDeepSkill = {
  sId: "go-deep",
  kind: "global",
  name: "Go Deep",
  userFacingDescription:
    "Enable comprehensive analysis across company data, databases, and web " +
    "sources — thorough analysis that may take several minutes.",
  agentFacingDescription:
    "Use for broad, research-intensive requests that benefit from decomposition into multiple " +
    "independent research threads, parallel sub-agents, or context isolation. Always use when " +
    "the user explicitly requests the Go Deep skill. Also use for explicit requests for deep " +
    "research or a comprehensive multi-source investigation. Do not use merely because the " +
    "response should be detailed, the task uses SQL, combines web and company data, or requires " +
    "several routine tool calls. Handle routine and moderately complex work directly. If " +
    "uncertain, do not enable it. Enable it midway only after the task has demonstrably expanded " +
    "enough to benefit from parallel sub-agents or context isolation.",
  fetchInstructions: async (
    auth: Authenticator,
    _params: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const flags = await getFeatureFlags(auth);
    const hasSandbox = isComputerFeatureEnabled(flags);
    return getDeepDiveInstructions({
      includeToolsetsPrompt: false,
      hasSandbox,
    });
  },
  mcpServers: [
    {
      name: "run_agent",
      childAgentId: GLOBAL_AGENTS_SID.DUST_TASK,
      serverNameOverride: "sub_agent",
    },
    {
      name: "run_agent",
      childAgentId: GLOBAL_AGENTS_SID.DUST_PLANNING,
      serverNameOverride: "planning_agent",
    },
    {
      name: "data_sources_file_system",
      serverNameOverride: SKILL_COMPANY_DATA_SERVER_NAME,
    },
    { name: "web_search_&_browse" },
    { name: "data_warehouses" },
  ],
  version: 3,
  icon: "ActionAtomIcon",
  isRestricted: isDeepDiveDisabledByAdmin,
  inheritAgentConfigurationDataSources: true,
} as const satisfies GlobalSkillDefinition;
