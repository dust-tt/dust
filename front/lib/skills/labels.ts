import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";

// Maximum length (in characters) of a skill's agent-facing description.
export const AGENT_FACING_DESCRIPTION_MAX_LENGTH = 1_000;

export const SKILL_INVOCATION_LABEL = "When to use this skill";
export const SKILL_INSTRUCTIONS_LABEL = "Instructions";

export const SKILL_AVAILABILITY_DISPLAY: Record<
  SkillAvailability,
  { label: string; color: "primary" | "success" | "highlight"; tooltip: string }
> = {
  editors: {
    label: "Editors only",
    color: "primary",
    tooltip: "Only editors can find it via the composer and agent builder",
  },
  workspace_users: {
    label: "Members",
    color: "success",
    tooltip: "All members can find it via the composer and agent builder",
  },
  users_and_agents: {
    label: "Members and agents",
    color: "highlight",
    tooltip: "Available to all members and agents with Discover Skills",
  },
};
