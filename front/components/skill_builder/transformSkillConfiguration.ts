import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { UserType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

/**
 * Transforms a skill configuration (server-side) into skill builder form data (client-side).
 * Editors are intentionally set to empty defaults as they will be populated reactively.
 */
export function transformSkillConfigurationToFormData(
  skillConfiguration: SkillType
): SkillBuilderFormData {
  return {
    name: skillConfiguration.name,
    agentFacingDescription: skillConfiguration.agentFacingDescription,
    userFacingDescription: skillConfiguration.userFacingDescription,
    instructions: skillConfiguration.instructions ?? "",
    editors: [], // Will be populated reactively from useEditors hook
    tools: skillConfiguration.tools.map(getDefaultMCPAction),
    icon: skillConfiguration.icon ?? null,
    extendedSkillId: skillConfiguration.extendedSkillId,
  };
}

/**
 * Returns default form data for creating a new skill.
 */
export function getDefaultSkillFormData({
  user,
  extendedSkillId = null,
}: {
  user: UserType;
  extendedSkillId?: string | null;
}): SkillBuilderFormData {
  return {
    name: "",
    agentFacingDescription: "",
    userFacingDescription: "",
    instructions: "",
    editors: [user],
    tools: [],
    icon: null,
    extendedSkillId,
  };
}
