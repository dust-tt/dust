import {
  ENABLE_SKILL_TOOL_NAME,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";

type SkillInstructionsType = Pick<SkillResource, "instructions">;

export type EnabledSkillType = Pick<
  SkillResource,
  "name" | "instructions" | "isSystemSkill"
> & {
  extendedSkill: SkillInstructionsType | null;
};

export type AvailableSkillType = Pick<
  SkillResource,
  "name" | "agentFacingDescription"
>;

export const SKILLS_AS_USER_MESSAGES_FEATURE_FLAG = "skills_as_user_messages";

const SKILLS_RENDERER_NAME = "system";

export function getEnabledSkillInstructions(skill: EnabledSkillType): string {
  const { name, instructions, extendedSkill } = skill;

  if (!extendedSkill) {
    return `<${name}>\n${instructions}\n</${name}>`;
  }

  return [
    `<${name}>`,
    extendedSkill.instructions,
    "<additional_guidelines>",
    instructions,
    "</additional_guidelines>",
    `</${name}>`,
  ].join("\n");
}

function renderSystemSkillMessage(text: string): UserMessageTypeModel {
  return {
    role: "user",
    name: SKILLS_RENDERER_NAME,
    content: [{ type: "text", text }],
  };
}

export function renderAvailableSkillsUserMessage(
  equippedSkills: AvailableSkillType[]
): UserMessageTypeModel | null {
  if (equippedSkills.length === 0) {
    return null;
  }

  const enableSkillToolName = `${SKILL_MANAGEMENT_SERVER_NAME}${TOOL_NAME_SEPARATOR}${ENABLE_SKILL_TOOL_NAME}`;
  const lines = equippedSkills.map(
    ({ name, agentFacingDescription }) => `- ${name}: ${agentFacingDescription}`
  );

  return renderSystemSkillMessage(
    `<dust_system>\n` +
      `The following skills are available for use with the ${enableSkillToolName} tool:\n\n` +
      `${lines.join("\n")}\n` +
      `</dust_system>`
  );
}

export function renderEnabledSkillUserMessage(
  skill: EnabledSkillType
): UserMessageTypeModel {
  return renderEnabledSkillUserMessageFromInstructions({
    skillName: skill.name,
    skillInstructions: getEnabledSkillInstructions(skill),
  });
}

export function renderEnabledSkillUserMessageFromInstructions({
  skillName,
  skillInstructions,
}: {
  skillName: string;
  skillInstructions: string;
}): UserMessageTypeModel {
  return renderSystemSkillMessage(
    `<dust_system>\n` +
      `The skill "${skillName}" is now enabled and remains active for the rest of the conversation.\n\n` +
      `${skillInstructions}\n` +
      `</dust_system>`
  );
}
