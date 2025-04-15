import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { OAuthProvider } from "@app/types";

const provider: OAuthProvider = "google_drive" as const;
const serverInfo: InternalMCPServerDefinitionType = {
  name: "authentication_debugger",
  version: "1.0.0",
  description: "You are a helpful server that can say hello to the user.",
  authorization: {
    provider,
    use_case: "connection" as const,
  },
  visual: "https://dust.tt/static/droidavatar/Droid_Green_1.jpg",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool("hello_world", "A simple hello world tool", async () => {
    const accessToken = await getAccessTokenForInternalMCPServer(auth, {
      mcpServerId,
      provider,
    });

    return {
      isError: false,
      content: [
        {
          type: "text",
          text: accessToken ? "Hello connected world !" : "Hello world !",
        },
      ],
    };
  });

  return server;
};

export default createServer;
