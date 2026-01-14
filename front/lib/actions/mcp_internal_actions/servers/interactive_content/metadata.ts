// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/instructions";

export const INTERACTIVE_CONTENT_SERVER_INFO = {
  name: "interactive_content" as const,
  version: "1.0.0",
  description: "Create dashboards, presentations, or any interactive content.",
  authorization: null,
  icon: "ActionFrameIcon" as const,
  documentationUrl: null,
  instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
};
