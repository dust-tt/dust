import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { SANDBOX_TOOL_NAME } from "@app/lib/api/actions/servers/sandbox/metadata";
import {
  ADD_EGRESS_DOMAIN_TOOL_NAME,
  isSandboxAgentEgressRequestsAllowed,
  TOOLS,
} from "@app/lib/api/actions/servers/sandbox/tools";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<McpServer> {
  const server = makeInternalMCPServer("sandbox");

  // The add_egress_domain tool requires Computer access and the
  // per-workspace setting that admins toggle on top of it.
  const flags = await getFeatureFlags(auth);
  const tools =
    isComputerFeatureEnabled(flags) && isSandboxAgentEgressRequestsAllowed(auth)
      ? TOOLS
      : TOOLS.filter((tool) => tool.name !== ADD_EGRESS_DOMAIN_TOOL_NAME);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: SANDBOX_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
