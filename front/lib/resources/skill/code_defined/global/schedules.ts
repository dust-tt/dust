import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

export const schedulesSkill = {
  sId: "schedules",
  kind: "global",
  name: "Schedules",
  userFacingDescription:
    "Create schedules and event triggers to automate recurring and event-driven tasks.",
  agentFacingDescription:
    "Create schedules and event triggers to automate recurring and event-driven tasks.",
  instructions: "",
  mcpServers: [{ name: "triggers_management" }],
  version: 1,
  icon: "ActionTimeIcon",
  getAutoEnabledOrEquippedForAgentLoop: ({ agentConfiguration }) =>
    agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST ? "enabled" : undefined,
} as const satisfies GlobalSkillDefinition;
