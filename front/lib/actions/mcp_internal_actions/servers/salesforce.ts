import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hupspot_utils";
import { makeMCPToolJSONSuccess } from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "salesforce",
  version: "1.0.0",
  description: "Salesforce tools.",
  authorization: {
    provider: "salesforce" as const,
    use_case: "platform_actions" as const,
  },
  icon: "SalesforceLogo",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool("hello_world", "Greet the user", {}, async () => {
    return withAuth(auth, mcpServerId, async () => {
      return makeMCPToolJSONSuccess({
        message: "Operation completed successfully",
        result: "Hello Soupinou",
      });
    });
  });

  return server;
};

export default createServer;
