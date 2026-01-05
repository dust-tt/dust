import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { UserType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

/**
 * Transforms a skill type (serialized server-side) into skill builder form data (client-side).
 * Editors are intentionally set to empty defaults as they will be populated reactively.
 */
export function transformSkillTypeToFormData(
  skill: SkillType
): SkillBuilderFormData {
  return {
    name: skill.name,
    agentFacingDescription: skill.agentFacingDescription,
    userFacingDescription: skill.userFacingDescription,
    instructions: skill.instructions ?? "",
    editors: [], // Will be populated reactively from useEditors hook
    tools: skill.tools.map(getDefaultMCPAction),
    icon: skill.icon ?? null,
    extendedSkillId: skill.extendedSkillId,
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
