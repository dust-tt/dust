import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const MISSING_ACTION_CATCHER_TOOL_NAME =
  "missing_action_catcher" as const;

// This server has dynamically created tools based on the agentLoopContext,
// so we don't have fixed tools metadata. The tools are created at runtime
// in the createServer function.

export const MISSING_ACTION_CATCHER_SERVER = {
  serverInfo: {
    name: "missing_action_catcher" as const,
    version: "1.0.0",
    description: "To be used to catch errors and avoid erroring.",
    authorization: null,
    icon: "ActionDocumentTextIcon" as const,
    documentationUrl: null,
    instructions: null,
  },
  // Tools are created dynamically at runtime based on the agentLoopContext.
  tools: [],
  tools_stakes: {},
} as const satisfies ServerMetadata;
