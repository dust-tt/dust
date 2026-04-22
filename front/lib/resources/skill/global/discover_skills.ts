import type { SystemSkillDefinition } from "@app/lib/resources/skill/global/shared";

// This skill allows discovering skills from the workspace. When equipped on an
// agent, it causes `listForAgentLoop` to include discoverable skills (custom
// default skills + regular global skills) in the equipped skills list.
export const discoverSkillsSkill = {
  sId: "discover_skills",
  name: "Discover Skills",
  userFacingDescription:
    "Automatically discover and activate workspace skills as needed.",
  agentFacingDescription:
    "List available workspace skills and enable them for the current conversation.",
  instructions:
    "Some of the available skills come from the workspace rather than " +
    "this agent's configuration. They can be enabled exactly like any other available skill.",
  version: 1,
  icon: "PuzzleIcon",
} as const satisfies SystemSkillDefinition;
