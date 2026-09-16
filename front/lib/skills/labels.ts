import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";

/**
 * @cc [owner:aubin-tchoi,label:product;backend] bounded-agent-facing-description
 * Skill Builder MUST reject agent-facing descriptions above this limit. Backend skill and
 * version writes MUST truncate them to this limit before persistence.
 */
export const AGENT_FACING_DESCRIPTION_MAX_LENGTH = 4_096;

/**
 * @cc [owner:aubin-tchoi,label:product;backend] bounded-user-facing-description
 * Skill Builder MUST reject user-facing descriptions above this limit. Backend skill and
 * version writes MUST truncate them to this limit before persistence.
 */
export const USER_FACING_DESCRIPTION_MAX_LENGTH = 2_048;

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
