import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { GOOGLE_DRIVE_TOOL_NAME } from "@app/lib/api/actions/servers/google_drive/metadata";
import {
  TOOLS,
  WRITE_TOOLS,
} from "@app/lib/api/actions/servers/google_drive/tools";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("google_drive");

  // Register read tools (always available).
  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: GOOGLE_DRIVE_TOOL_NAME,
    });
  }

  // Register write tools if feature flag is enabled.
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (featureFlags.includes("google_drive_write_enabled")) {
    for (const tool of WRITE_TOOLS) {
      registerTool(auth, agentLoopContext, server, tool, {
        monitoringName: GOOGLE_DRIVE_TOOL_NAME,
      });
    }
  }

  return server;
}

export default createServer;
