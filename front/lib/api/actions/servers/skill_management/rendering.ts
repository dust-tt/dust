import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const ENABLE_SKILL_RESULT_MIME_TYPE =
  INTERNAL_MIME_TYPES.TOOL_OUTPUT.ENABLE_SKILL_RESULT;
const ENABLE_SKILL_RESULT_URI_PREFIX = "dust://enable-skill-result/";

const EnableSkillResultResourceSchema = z.object({
  mimeType: z.literal(ENABLE_SKILL_RESULT_MIME_TYPE),
  uri: z.string().startsWith(ENABLE_SKILL_RESULT_URI_PREFIX),
  text: z.string(),
});

type EnableSkillResultResourceType = z.infer<
  typeof EnableSkillResultResourceSchema
>;

export function makeEnableSkillResultOutput({
  skillId,
  text,
}: {
  skillId: string;
  text: string;
}): CallToolResult["content"][number] {
  return {
    type: "resource",
    resource: {
      mimeType: ENABLE_SKILL_RESULT_MIME_TYPE,
      uri: `${ENABLE_SKILL_RESULT_URI_PREFIX}${skillId}`,
      text,
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

  return outputBlock.resource.uri.slice(ENABLE_SKILL_RESULT_URI_PREFIX.length);
}
