import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const ENABLE_SKILL_RESULT_MIME_TYPE =
  INTERNAL_MIME_TYPES.TOOL_OUTPUT.ENABLE_SKILL_RESULT;

const EnableSkillResultResourceSchema = z.object({
  mimeType: z.literal(ENABLE_SKILL_RESULT_MIME_TYPE),
  uri: z.literal(""),
  text: z.string(),
  skillId: z.string(),
});

type EnableSkillResultResourceType = z.infer<
  typeof EnableSkillResultResourceSchema
>;
type EnableSkillResultOutputType = {
  type: "resource";
  resource: EnableSkillResultResourceType;
};

export function makeEnableSkillResultOutput({
  skillId,
  text,
}: {
  skillId: string;
  text: string;
}): EnableSkillResultOutputType {
  return {
    type: "resource",
    resource: {
      mimeType: ENABLE_SKILL_RESULT_MIME_TYPE,
      uri: "",
      text,
      skillId,
    },
  };
}

export function isEnableSkillResultOutput(
  outputBlock: CallToolResult["content"][number]
): outputBlock is EnableSkillResultOutputType {
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
