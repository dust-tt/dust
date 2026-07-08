import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type {
  SkillRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";
import type { UserType } from "@app/types/user";

/**
 * Transforms a skill type (serialized server-side) into skill builder form data (client-side).
 * Editors are intentionally set to empty defaults as they will be populated reactively.
 */
export function transformSkillTypeToFormData(
  skill: SkillType & { relations?: Pick<SkillRelations, "childSkills"> }
): SkillBuilderFormData {
  return {
    name: skill.name,
    agentFacingDescription: skill.agentFacingDescription,
    userFacingDescription: skill.userFacingDescription,
    instructions: skill.instructions ?? "",
    instructionsHtml: skill.instructionsHtml ?? "",
    editors: [], // Will be populated reactively from useEditors hook
    tools: skill.tools.map(getDefaultMCPAction),
    fileAttachments: skill.fileAttachments,
    icon: skill.icon ?? null,
    isDefault: skill.isDefault,
    reinforcement: skill.reinforcement,
    additionalSpaces: [],
    referencedSkills:
      skill.relations?.childSkills.map((childSkill) => ({
        id: childSkill.sId,
        name: childSkill.name,
        icon: childSkill.icon,
        requestedSpaceIds: childSkill.requestedSpaceIds,
      })) ?? [],
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
    agentFacingDescription: "",
    userFacingDescription: "",
    instructions: "",
    instructionsHtml: "",
    editors: [user],
    tools: [],
    fileAttachments: [],
    icon: null,
    isDefault: false,
    reinforcement: "on",
    additionalSpaces: [],
    referencedSkills: [],
  };
}
