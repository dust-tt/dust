import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const SkillAuthoringResultResourceSchema = z.object({
  mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.SKILL_AUTHORING_RESULT),
  uri: z.literal(""),
  text: z.string(),
  operation: z.enum(["create", "update"]),
  skillId: z.string(),
  skillName: z.string(),
  url: z.string(),
});

type SkillAuthoringResultResourceType = z.infer<
  typeof SkillAuthoringResultResourceSchema
>;

export function makeSkillAuthoringResultOutput({
  operation,
  skillId,
  skillName,
  text,
  workspaceId,
}: {
  operation: "create" | "update";
  skillId: string;
  skillName: string;
  text: string;
  workspaceId: string;
}): {
  type: "resource";
  resource: SkillAuthoringResultResourceType;
} {
  return {
    type: "resource",
    resource: {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.SKILL_AUTHORING_RESULT,
      uri: "",
      text,
      operation,
      skillId,
      skillName,
      url: `/w/${workspaceId}/builder/skills/${skillId}`,
    },
  };
}

export function isSkillAuthoringResultOutput(
  outputBlock: CallToolResult["content"][number]
): outputBlock is {
  type: "resource";
  resource: SkillAuthoringResultResourceType;
} {
  return (
    outputBlock.type === "resource" &&
    SkillAuthoringResultResourceSchema.safeParse(outputBlock.resource).success
  );
}
