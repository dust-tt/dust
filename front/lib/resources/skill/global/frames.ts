import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/instructions";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const framesSkill = {
  sId: "frames",
  name: "Frames",
  userFacingDescription:
    "Create dashboards, presentations, or any interactive content.",
  // TODO(skills 2025-12-12): add an appropriate description.
  agentFacingDescription: "",
  instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
  internalMCPServerNames: ["interactive_content"],
  version: 1,
} as const satisfies GlobalSkillDefinition;
