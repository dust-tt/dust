import {
  ENABLE_SKILL_TOOL_NAME,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERACTIVE_CONTENT_INSTRUCTIONS_OPENAI_V1 } from "@app/lib/api/actions/servers/interactive_content/instructions";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { stripSkillTagPresentationAttributes } from "@app/lib/skills/format";
import { stripToolTagPresentationAttributes } from "@app/lib/tools/format";
import type { AgentConfigurationFramesVariantContext } from "@app/types/assistant/agent";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type EnabledSkill = SkillResource & {
  extendedSkill: SkillResource | null;
};

type SkillInstructionsSource = Pick<SkillResource, "sId" | "instructions">;

export function resolveSkillInstructions({
  agentConfiguration,
  skill,
}: {
  agentConfiguration?: AgentConfigurationFramesVariantContext;
  skill: SkillInstructionsSource;
}): string {
  if (skill.sId !== "frames" || !agentConfiguration?.framesVariant) {
    return skill.instructions;
  }

  switch (agentConfiguration.framesVariant) {
    case "openai-v1":
      return INTERACTIVE_CONTENT_INSTRUCTIONS_OPENAI_V1;
    default:
      return assertNever(agentConfiguration.framesVariant);
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
    agentConfiguration,
  }: {
    agentConfiguration?: AgentConfigurationFramesVariantContext;
  } = {}
): string {
  const { name, extendedSkill } = skill;
  const modelInstructions = stripInstructionPresentationAttributes(
    resolveSkillInstructions({ agentConfiguration, skill })
  );

  if (!extendedSkill) {
    return `<${name}>\n${modelInstructions}\n</${name}>`;
  }

  const extendedModelInstructions = stripInstructionPresentationAttributes(
    resolveSkillInstructions({ agentConfiguration, skill: extendedSkill })
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
  agentConfiguration,
  skill,
}: {
  agentConfiguration?: AgentConfigurationFramesVariantContext;
  skill: EnabledSkill;
}): UserMessageTypeModel {
  const skillInstructions = getEnabledSkillInstructions(skill, {
    agentConfiguration,
  });

  return renderSystemSkillMessage(
    `<dust_system>\n${skillInstructions}\n</dust_system>`
  );
}
