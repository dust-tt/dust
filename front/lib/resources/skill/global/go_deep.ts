import { getDeepDiveInstructions } from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import { isDeepDiveDisabledByAdmin } from "@app/lib/api/assistant/global_agents/configurations/dust/utils";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import { GLOBAL_AGENTS_SID } from "@app/types";

export const goDeepSkill = {
  sId: "go-deep",
  name: "Go Deep",
  userFacingDescription:
    "Enable comprehensive analysis across company data, databases, and web " +
    "sources — thorough analysis that may take several minutes.",
  agentFacingDescription:
    "Enable when the user asks complex or research-heavy questions. Ideal for analysis " +
    "tasks requiring comprehensive research across multiple data sources, databases, or web " +
    "resources. Enable when the user explicitly asks for a deep dive, for a detailed response " +
    "or for thorough analysis.",
  instructions: getDeepDiveInstructions({ includeToolsetsPrompt: false }),
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
    { name: "data_sources_file_system" },
    { name: "web_search_&_browse" },
    { name: "data_warehouses" },
  ],
  version: 2,
  icon: "ActionAtomIcon",
  isRestricted: isDeepDiveDisabledByAdmin,
} as const satisfies GlobalSkillDefinition;
