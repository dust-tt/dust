import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const POD_APP_TOOLSET_SERVER_NAME = "pod_app_toolset" as const;

// Tools are fully dynamic: one tool per published function of the shared pod app bound to each
// server instance, resolved at listing time from the PodAppShare row. The static list is empty.
export const POD_APP_TOOLSET_SERVER = {
  serverInfo: {
    name: POD_APP_TOOLSET_SERVER_NAME,
    version: "1.0.0",
    description: "Functions from a shared pod app, exposed as agent tools.",
    icon: "CommandLineIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: [],
} as const satisfies ServerMetadata;
