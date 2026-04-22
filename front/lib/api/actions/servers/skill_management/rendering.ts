import { isToolMarkerResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  type EnabledSkillType,
  getEnabledSkillInstructions,
} from "@app/lib/api/assistant/skills_rendering";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const ENABLE_SKILL_INSTRUCTIONS_MARKER = "enable_skill_instructions" as const;

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

  if (outputBlock.resource.text !== ENABLE_SKILL_INSTRUCTIONS_MARKER) {
    return null;
  }

  const resource = outputBlock.resource as typeof outputBlock.resource & {
    _meta?: Record<string, unknown>;
    skillName?: unknown;
    skillInstructions?: unknown;
  };
  const metadata =
    "skillName" in resource && "skillInstructions" in resource
      ? resource
      : resource._meta;
  const skillName = metadata?.skillName;
  const skillInstructions = metadata?.skillInstructions;
  if (typeof skillName !== "string" || typeof skillInstructions !== "string") {
    return null;
  }

  return { skillName, skillInstructions };
}
