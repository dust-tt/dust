import { isToolMarkerResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const ENABLE_SKILL_INSTRUCTIONS_MARKER = "enable_skill_instructions";

const EnableSkillInstructionsMarkerResourceSchema = z.object({
  mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER),
  uri: z.literal(""),
  text: z.literal(ENABLE_SKILL_INSTRUCTIONS_MARKER),
  skillId: z.string(),
});

export function makeEnableSkillInstructionsMarker(
  skillId: string
): CallToolResult["content"][number] {
  return {
    type: "resource",
    resource: {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
      uri: "",
      text: ENABLE_SKILL_INSTRUCTIONS_MARKER,
      _meta: {
        skillId,
      },
    },
  };
}

export function getEnableSkillIdFromOutputBlock(
  outputBlock: CallToolResult["content"][number]
): string | null {
  if (!isToolMarkerResourceType(outputBlock)) {
    return null;
  }

  const parsedResource = EnableSkillInstructionsMarkerResourceSchema.safeParse(
    outputBlock.resource
  );
  if (!parsedResource.success) {
    return null;
  }

  return parsedResource.data.skillId;
}
