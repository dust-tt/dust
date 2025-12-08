import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { UserType } from "@app/types";
import type { SkillConfigurationType } from "@app/types/skill_configuration";

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
    description: skillConfiguration.description,
    instructions: skillConfiguration.instructions,
    editors: [], // Will be populated reactively from useEditors hook
<<<<<<< HEAD
    tools: [], // Will be populated reactively from MCP server views context
=======
    tools: skillConfiguration.tools || [],
>>>>>>> c8ec270dd6 ([skill_builder] - feature: enhance SkillBuilder to support editing and duplicating skills)
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
  };
}

/**
 * Transforms a skill configuration for duplication into skill builder form data.
 * Similar to transformSkillConfigurationToFormData but adds "_Copy" suffix to name
 * and resets editors to current user.
 */
export function transformDuplicateSkillToFormData(
  skillConfiguration: SkillConfigurationType,
  user: UserType
): SkillBuilderFormData {
  const baseFormData =
    transformSkillConfigurationToFormData(skillConfiguration);

  return {
    ...baseFormData,
    name: `${skillConfiguration.name}_Copy`,
    editors: [user], // Reset editors to current user for duplicated skill
  };
}
