import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";
import { getAccessTokenForMCPServer } from "@app/lib/actions/mcp_oauth_helper";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: Omit<MCPServerMetadata, "tools" | "id"> = {
  name: "hello-world-server",
  version: "1.0.0",
  description: "You are a helpful server that can say hello to the user.",
  authorization: {
    provider: "google_drive" as const,
    use_case: "connection" as const,
  },
  icon: "rocket",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool("helloworld", "A simple hello world tool", async () => {
    const accessToken = await getAccessTokenForMCPServer(
      auth,
      mcpServerId,
      serverInfo.authorization
    );

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
