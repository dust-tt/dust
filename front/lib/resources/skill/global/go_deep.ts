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
    "Use when the user asks complex, multi-faceted questions requiring " +
    "comprehensive research across multiple data sources, databases, and web " +
    "resources. Ideal for analysis tasks that need thorough investigation " +
    "beyond your current capabilities.",
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
