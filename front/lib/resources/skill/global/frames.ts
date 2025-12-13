import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/instructions";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const framesSkill = {
  sId: "frames",
  name: "Frames",
  agentFacingDescription:
    "Create dashboards, presentations, or any interactive content.",
  instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
  version: 1,
} as const satisfies GlobalSkillDefinition;
