import {
  ENABLE_SKILL_TOOL_NAME,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { stripSkillTagPresentationAttributes } from "@app/lib/skills/format";
import { stripToolTagPresentationAttributes } from "@app/lib/tools/format";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";

export type EnabledSkill = SkillResource;

function renderSkillMessage(
  text: string,
  name: "system" | "user"
): UserMessageTypeModel {
  return {
    role: "user",
    name,
    content: [{ type: "text", text }],
  };
}

function stripInstructionPresentationAttributes(content: string): string {
  return stripSkillTagPresentationAttributes(
    stripToolTagPresentationAttributes(content)
  );
}

export function getEnabledSkillInstructions(
  skill: Pick<SkillResource, "sId" | "name" | "instructions">
): string {
  const modelInstructions = stripInstructionPresentationAttributes(
    skill.instructions
  );

  return `<${skill.name}>\n${modelInstructions}\n</${skill.name}>`;
}

export function renderAvailableSkillsUserMessage(
  skills: Pick<SkillResource, "name" | "agentFacingDescription">[],
  name: "system" | "user"
): UserMessageTypeModel | null {
  if (skills.length === 0) {
    return null;
  }

  const enableSkillToolName = `${SKILL_MANAGEMENT_SERVER_NAME}${TOOL_NAME_SEPARATOR}${ENABLE_SKILL_TOOL_NAME}`;
  // Names are rendered as code literals rather than bold text: `skillName` is matched exactly, and
  // a literal is copied verbatim far more reliably than prose. Workspaces tend to develop their own
  // naming conventions, and models otherwise regenerate names to fit the pattern they infer from
  // the list instead of copying them, which never resolves.
  const lines = skills.map(
    ({ name, agentFacingDescription }) =>
      `- \`${name}\`: ${agentFacingDescription.replaceAll("\n", "\n  ")}`
  );

  return renderSkillMessage(
    `<dust_system>\n` +
      `The following skills are available for use with the ${enableSkillToolName} tool:\n\n` +
      `${lines.join("\n")}\n\n` +
      `Pass \`skillName\` exactly as written between backticks above, character for character: ` +
      `same case, same spacing, same punctuation, same prefixes and suffixes. Copy the name ` +
      `rather than retyping it, and do not adjust it to match how other skills in the list are ` +
      `named. Names are matched exactly, so a modified name will not be found.\n` +
      `</dust_system>`,
    name
  );
}

export function renderEnabledSkillUserMessageFromInstructions({
  skill,
}: {
  skill: EnabledSkill;
}): UserMessageTypeModel {
  const skillInstructions = getEnabledSkillInstructions(skill);

  return renderSkillMessage(
    `<dust_system>\n${skillInstructions}\n</dust_system>`,
    "system"
  );
}
