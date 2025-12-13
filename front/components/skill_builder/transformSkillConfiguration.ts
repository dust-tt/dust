import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { UserType } from "@app/types";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

/**
 * Transforms a skill configuration (server-side) into skill builder form data (client-side).
 * Dynamic values (editors, tools) are intentionally set to empty defaults
 * as they will be populated reactively in the component.
 */
export function transformSkillConfigurationToFormData(
  skillConfiguration: SkillConfigurationType
): SkillBuilderFormData {
  return {
    name: skillConfiguration.name,
    description: skillConfiguration.agentFacingDescription,
    instructions: skillConfiguration.instructions ?? "",
    editors: [], // Will be populated reactively from useEditors hook
    tools: [], // Will be populated reactively from MCP server views context
    icon: skillConfiguration.icon ?? null,
  };
}

/**
 * Returns default form data for creating a new skill.
 */
export function getDefaultSkillFormData({
  user,
}: {
  user: UserType;
}): SkillBuilderFormData {
  return {
    name: "",
    description: "",
    instructions: "",
    editors: [user],
    tools: [],
    icon: null,
  };
}
