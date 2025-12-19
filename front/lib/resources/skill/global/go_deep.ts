import {
  DEEP_DIVE_NAME,
  DEEP_DIVE_SERVER_INSTRUCTIONS,
} from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const goDeepSkill = {
  sId: "go-deep",
  name: "Go Deep",
  userFacingDescription:
    `Hand off complex questions to the @${DEEP_DIVE_NAME} agent for comprehensive analysis ` +
    `across company data, databases, and web sources—thorough analysis that may take several ` +
    `minutes.`,
  agentFacingDescription:
    "Use when the user asks complex, multi-faceted questions requiring " +
    "comprehensive research across multiple data sources, databases, and web " +
    "resources. Ideal for analysis tasks that need thorough investigation " +
    "beyond your current capabilities.",
  instructions: DEEP_DIVE_SERVER_INSTRUCTIONS,
  internalMCPServerNames: ["deep_dive"],
  version: 1,
} as const satisfies GlobalSkillDefinition;
