import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/instructions";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const framesSkill = {
  description: "Create dashboards, presentations, or any interactive content.",
  instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
  internalMCPServerNames: ["interactive_content"],
  name: "Frames",
  sId: "frames",
  version: 1,
} as const satisfies GlobalSkillDefinition;
