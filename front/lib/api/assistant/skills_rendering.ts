import {
  ENABLE_SKILL_TOOL_NAME,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERACTIVE_CONTENT_INSTRUCTIONS_OPENAI_V1 } from "@app/lib/api/actions/servers/interactive_content/instructions";
import { getFramesVariantForAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import { framesSkill } from "@app/lib/resources/skill/code_defined/frames";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { stripSkillTagPresentationAttributes } from "@app/lib/skills/format";
import { stripToolTagPresentationAttributes } from "@app/lib/tools/format";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type EnabledSkill = SkillResource & {
  extendedSkill: SkillResource | null;
};

type SkillInstructionsSource = Pick<SkillResource, "sId" | "instructions">;

// Frames is the only skill with a per-agent variant today. If a second skill
// ever needs one, replace this with a per-skill variant registry.
export function resolveSkillInstructions({
  agentSId,
  skill,
}: {
  agentSId?: string;
  skill: SkillInstructionsSource;
}): string {
  if (skill.sId !== framesSkill.sId) {
    return skill.instructions;
  }

  const variant = getFramesVariantForAgent(agentSId);
  if (!variant) {
    return skill.instructions;
  }

  switch (variant) {
    case "openai-v1":
      return INTERACTIVE_CONTENT_INSTRUCTIONS_OPENAI_V1;
    default:
      return assertNever(variant);
  }
}

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
  skill: Pick<SkillResource, "sId" | "name" | "instructions"> & {
    extendedSkill: SkillInstructionsSource | null;
  },
  {
    agentSId,
  }: {
    agentSId?: string;
  } = {}
): string {
  const { name, extendedSkill } = skill;
  const modelInstructions = stripInstructionPresentationAttributes(
    resolveSkillInstructions({ agentSId, skill })
  );

  if (!extendedSkill) {
    return `<${name}>\n${modelInstructions}\n</${name}>`;
  }

  const extendedModelInstructions = stripInstructionPresentationAttributes(
    resolveSkillInstructions({ agentSId, skill: extendedSkill })
  );

  return [
    `<${name}>`,
    extendedModelInstructions,
    "<additional_guidelines>",
    modelInstructions,
    "</additional_guidelines>",
    `</${name}>`,
  ].join("\n");
}

export function renderEquippedSkillsUserMessage(
  equippedSkills: SkillResource[]
): UserMessageTypeModel | null {
  if (equippedSkills.length === 0) {
    return null;
  }

  const enableSkillToolName = `${SKILL_MANAGEMENT_SERVER_NAME}${TOOL_NAME_SEPARATOR}${ENABLE_SKILL_TOOL_NAME}`;
  const lines = equippedSkills.map(
    ({ name, agentFacingDescription }) =>
      `- **${name}**: ${agentFacingDescription.replaceAll("\n", "\n  ")}`
  );

  return renderSystemSkillMessage(
    `<dust_system>\n` +
      `The following skills are available for use with the ${enableSkillToolName} tool:\n\n` +
      `${lines.join("\n")}\n` +
      `</dust_system>`
  );
}

export function renderEnabledSkillUserMessageFromInstructions({
  agentSId,
  skill,
}: {
  agentSId?: string;
  skill: EnabledSkill;
}): UserMessageTypeModel {
  const skillInstructions = getEnabledSkillInstructions(skill, {
    agentSId,
  });

  return renderSystemSkillMessage(
    `<dust_system>\n${skillInstructions}\n</dust_system>`
  );
}
