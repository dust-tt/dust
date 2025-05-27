import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeMCPToolPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_internal_actions/authentication";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getConnectionForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import { makeMCPToolJSONSuccess } from "@app/lib/actions/mcp_internal_actions/utils";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "gmail",
  version: "1.0.0",
  description: "Gmail tools.",
  authorization: {
    provider: "gmail" as const,
    use_case: "personal_actions" as const,
  },
  icon: "GmailLogo",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool("hello_world", "Greet the Gmail user", {}, async () => {
    const connection = await getConnectionForInternalMCPServer(auth, {
      mcpServerId,
      connectionType: "personal",
    });

    const accessToken = connection?.access_token;

    if (!accessToken) {
      return makeMCPToolPersonalAuthenticationRequiredError(
        mcpServerId,
        serverInfo.authorization!
      );
    }

    return makeMCPToolJSONSuccess({
      message: "Operation completed successfully",
      result: "Hello, Gmail user!",
    });
  });

  return server;
};

export default createServer;
