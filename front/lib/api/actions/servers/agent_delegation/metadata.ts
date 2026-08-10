import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { GENERIC_RUN_AGENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/run_agent/metadata";

export const AGENT_DELEGATION_SERVER_NAME = "agent_delegation" as const;

export const AGENT_DELEGATION_SERVER = {
  serverInfo: {
    name: AGENT_DELEGATION_SERVER_NAME,
    version: "1.0.0",
    description: "Run an accessible workspace agent by ID.",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
  },
  tools: GENERIC_RUN_AGENT_TOOLS_METADATA,
} as const satisfies ServerMetadata;
