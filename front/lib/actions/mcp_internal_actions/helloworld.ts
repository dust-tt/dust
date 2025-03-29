import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";

export const serverInfo: Omit<MCPServerMetadata, "tools" | "id"> = {
  name: "hello-world-server",
  version: "1.0.0",
  description: "You are a helpful server that can say hello to the user.",
  authorization: {
    provider: "google_drive" as const,
    use_case: "connection" as const,
  },
  icon: "rocket",
};

export const createServer = (apiToken?: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool("helloworld", "A simple hello world tool", () => {
    return {
      isError: false,
      content: [
        {
          type: "text",
          text: apiToken ? "Hello connected world !" : "Hello world !",
        },
      ],
    };
  });

  return server;
};
