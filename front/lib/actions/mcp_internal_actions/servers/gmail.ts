import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  makeMCPToolJSONSuccess,
  makeMCPToolPersonalAuthenticationRequiredError,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getConnectionForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";

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
    const instanceUrl = connection?.connection.metadata.instance_url as
      | string
      | undefined;

    if (!accessToken || !instanceUrl) {
      return makeMCPToolPersonalAuthenticationRequiredError(mcpServerId);
    }

    return makeMCPToolJSONSuccess({
      message: "Operation completed successfully",
      result: "Hello, Gmail user!",
    });
  });

  return server;
};

export default createServer;
