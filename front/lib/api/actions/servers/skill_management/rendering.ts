import { isToolMarkerResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  type EnabledSkillType,
  getEnabledSkillInstructions,
} from "@app/lib/api/assistant/skills_rendering";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const ENABLE_SKILL_INSTRUCTIONS_MARKER = "enable_skill_instructions";

const EnableSkillInstructionsMarkerResourceSchema = z.object({
  mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER),
  uri: z.literal(""),
  text: z.literal(ENABLE_SKILL_INSTRUCTIONS_MARKER),
  _meta: z.object({
    skillName: z.string(),
    skillInstructions: z.string(),
  }),
});

export function makeEnableSkillInstructionsMarker(
  skill: EnabledSkillType
): CallToolResult["content"][number] {
  return {
    type: "resource",
    resource: {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
      uri: "",
      text: ENABLE_SKILL_INSTRUCTIONS_MARKER,
      _meta: {
        skillName: skill.name,
        skillInstructions: getEnabledSkillInstructions(skill),
      },
    },
  };
}

export function getEnableSkillInstructionsFromOutputBlock(
  outputBlock: CallToolResult["content"][number]
): { skillName: string; skillInstructions: string } | null {
  if (!isToolMarkerResourceType(outputBlock)) {
    return null;
  }

  const parsedResource = EnableSkillInstructionsMarkerResourceSchema.safeParse(
    outputBlock.resource
  );
  if (!parsedResource.success) {
    return null;
  }

  const { skillName, skillInstructions } = parsedResource.data._meta;
  return { skillName, skillInstructions };
}
