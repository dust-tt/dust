import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/api/actions/servers/interactive_content/instructions";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const framesSkill = {
  sId: "frames",
  name: "Create Frames",
  userFacingDescription:
    "Turn insights into interactive dashboards and presentations your team can explore, customize," +
    " and share. Living documents that adapt to different stakeholders.",
  agentFacingDescription:
    "Create interactive visualizations, charts, dashboards, and presentations as executable React " +
    "components. These visualizations are typically called 'Frames' and can be used in various " +
    "contexts: daily digests, data analytics, sales reports, and more. Consider using when tsx " +
    "or React code is shared or available in the conversation.",
  instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
  mcpServers: [{ name: "interactive_content" }],
  version: 1,
  icon: "ActionFrameIcon",
} as const satisfies GlobalSkillDefinition;
