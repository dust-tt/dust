import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "gmail",
  version: "1.0.0",
  description: "Gmail tools.",
  /**
   * authorization: {
   * provider: "google_drive" as const,
   * use_case: "personal_actions" as const,
   * },
   */
  authorization: null,
  icon: "GmailLogo",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool("hello_world", "Greet the Gmail user", {}, async () => {
    return makeMCPToolTextError(
      `Authentication not configured for server ${mcpServerId}.`
    );
  });

  return server;
};

export default createServer;
