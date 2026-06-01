import {
  ENABLE_SKILL_TOOL_NAME,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERACTIVE_CONTENT_INSTRUCTIONS_V2 } from "@app/lib/api/actions/servers/interactive_content/instructions";
import { framesSkill } from "@app/lib/resources/skill/code_defined/frames";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { stripSkillTagPresentationAttributes } from "@app/lib/skills/format";
import { stripToolTagPresentationAttributes } from "@app/lib/tools/format";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";

export type EnabledSkill = SkillResource & {
  extendedSkill: SkillResource | null;
};

type SkillInstructionsSource = Pick<SkillResource, "sId" | "instructions">;

// `useFramesV2` is a workspace-level feature flag gate, not a per-agent
// switch. When a third variant lands, replace the boolean with a
// discriminated union + exhaustive `switch` so reviewers can't forget a
// branch (the previous shape used `assertNever` on a `FramesVariant` union).
export function resolveSkillInstructions({
  skill,
  useFramesV2,
}: {
  skill: SkillInstructionsSource;
  useFramesV2: boolean;
}): string {
  if (skill.sId !== framesSkill.sId) {
    return skill.instructions;
  }

  return useFramesV2 ? INTERACTIVE_CONTENT_INSTRUCTIONS_V2 : skill.instructions;
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
    useFramesV2 = false,
  }: {
    useFramesV2?: boolean;
  } = {}
): string {
  const { name, extendedSkill } = skill;
  const modelInstructions = stripInstructionPresentationAttributes(
    resolveSkillInstructions({ skill, useFramesV2 })
  );

  if (!extendedSkill) {
    return `<${name}>\n${modelInstructions}\n</${name}>`;
  }

  const extendedModelInstructions = stripInstructionPresentationAttributes(
    resolveSkillInstructions({ skill: extendedSkill, useFramesV2 })
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
  skill,
  useFramesV2 = false,
}: {
  skill: EnabledSkill;
  useFramesV2?: boolean;
}): UserMessageTypeModel {
  const skillInstructions = getEnabledSkillInstructions(skill, {
    useFramesV2,
  });

  return renderSystemSkillMessage(
    `<dust_system>\n${skillInstructions}\n</dust_system>`
  );
}
