import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/instructions";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const framesSkill = {
  sId: "frames",
  name: "Frames",
  userFacingDescription:
    "Create dashboards, presentations, or any interactive content.",
  agentFacingDescription:
    "Create interactive visualizations, charts, dashboards, and presentations as executable React components.",
  instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
  internalMCPServerNames: ["interactive_content"],
  version: 1,
  icon: "ActionFrameIcon",
} as const satisfies GlobalSkillDefinition;
