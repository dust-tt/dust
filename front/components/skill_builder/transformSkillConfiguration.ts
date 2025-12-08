import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { UserType } from "@app/types";
import type { SkillConfiguration } from "@app/types/skill_configuration";

/**
 * Transforms a skill configuration (server-side) into skill builder form data (client-side).
 * Dynamic values (editors) are intentionally set to empty defaults
 * as they will be populated reactively in the component.
 */
export function transformSkillConfigurationToFormData(
  skillConfiguration: SkillConfiguration
): SkillBuilderFormData {
  return {
    name: skillConfiguration.name,
    description: skillConfiguration.description,
    instructions: skillConfiguration.instructions,
    scope: skillConfiguration.scope,
    editors: [], // Will be populated reactively from useEditors hook
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
    scope: "private",
    editors: [user],
  };
}

/**
 * Transforms a skill configuration for duplication into skill builder form data.
 * Similar to transformSkillConfigurationToFormData but adds "_Copy" suffix to name,
 * resets editors to current user, and defaults to private scope.
 */
export function transformDuplicateSkillToFormData(
  skillConfiguration: SkillConfiguration,
  user: UserType
): SkillBuilderFormData {
  const baseFormData =
    transformSkillConfigurationToFormData(skillConfiguration);

  return {
    ...baseFormData,
    name: `${skillConfiguration.name}_Copy`,
    scope: "private", // Default duplicated skills to private scope
    editors: [user], // Reset editors to current user for duplicated skill
  };
}
