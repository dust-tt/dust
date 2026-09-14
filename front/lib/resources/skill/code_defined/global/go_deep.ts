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
    "Use only when the user explicitly asks to use Go Deep, asks for a deep dive or deep " +
    "research, or requests a comprehensive multi-source investigation. Do not infer that Go " +
    "Deep is needed from task complexity alone. Do not use it merely because the response should " +
    "be detailed, the task uses SQL, combines web and company data, requires several tool calls, " +
    "or could be parallelized. If none of the explicit activation conditions is clearly met, " +
    "handle the request directly. When in doubt, do not enable it.",
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
