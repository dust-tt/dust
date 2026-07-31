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

function renderSystemSkillMessage(text: string): UserMessageTypeModel {
  return {
    role: "user",
    name: "system",
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

export function renderEquippedSkillsUserMessage(
  equippedSkills: SkillResource[]
): UserMessageTypeModel | null {
  if (equippedSkills.length === 0) {
    return null;
  }

  const enableSkillToolName = `${SKILL_MANAGEMENT_SERVER_NAME}${TOOL_NAME_SEPARATOR}${ENABLE_SKILL_TOOL_NAME}`;
  // Names are rendered as code literals rather than bold text: `skillName` is matched exactly, and
  // a literal is copied verbatim far more reliably than prose. Workspaces often name skills with a
  // `[Category] Title` convention, and models otherwise regenerate names to fit that pattern —
  // wrapping an unbracketed name, or inventing a category prefix — which never resolves.
  const lines = equippedSkills.map(
    ({ name, agentFacingDescription }) =>
      `- \`${name}\`: ${agentFacingDescription.replaceAll("\n", "\n  ")}`
  );

  return renderSystemSkillMessage(
    `<dust_system>\n` +
      `The following skills are available for use with the ${enableSkillToolName} tool:\n\n` +
      `${lines.join("\n")}\n\n` +
      `Pass \`skillName\` exactly as written between backticks above: same case, same ` +
      `punctuation, and including any leading \`[Category]\` prefix. Do not add brackets, ` +
      `invent a prefix, or otherwise reformat the name. Names are matched exactly, so a ` +
      `modified name will not be found.\n` +
      `</dust_system>`
  );
}

export function renderEnabledSkillUserMessageFromInstructions({
  skill,
}: {
  skill: EnabledSkill;
}): UserMessageTypeModel {
  const skillInstructions = getEnabledSkillInstructions(skill);

  return renderSystemSkillMessage(
    `<dust_system>\n${skillInstructions}\n</dust_system>`
  );
}
