import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const EnableSkillResultResourceSchema = z.object({
  mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.ENABLE_SKILL_RESULT),
  uri: z.literal(""),
  text: z.string(),
  skillId: z.string(),
});

type EnableSkillResultResourceType = z.infer<
  typeof EnableSkillResultResourceSchema
>;

/**
 * @cc [owner:philipperolet,label:performance] skill-management-tools-only
 * This output MUST only be returned by tools of the `skill_management` internal server:
 * `canEnableSkill` relies on it to skip loading the outputs of every other action.
 */
export function makeEnableSkillResultOutput({
  skillId,
  text,
}: {
  skillId: string;
  text: string;
}): {
  type: "resource";
  resource: EnableSkillResultResourceType;
} {
  return {
    type: "resource",
    resource: {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.ENABLE_SKILL_RESULT,
      uri: "",
      text,
      skillId,
    },
  };
}

export function isEnableSkillResultOutput(
  outputBlock: CallToolResult["content"][number]
): outputBlock is {
  type: "resource";
  resource: EnableSkillResultResourceType;
} {
  return (
    outputBlock.type === "resource" &&
    EnableSkillResultResourceSchema.safeParse(outputBlock.resource).success
  );
}

export function getEnableSkillIdFromOutputBlock(
  outputBlock: CallToolResult["content"][number]
): string | null {
  if (!isEnableSkillResultOutput(outputBlock)) {
    return null;
  }

  return outputBlock.resource.skillId;
}
