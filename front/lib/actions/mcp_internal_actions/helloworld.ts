import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";

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

export const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool("helloworld", "A simple hello world tool", () => {
    return {
      isError: false,
      content: [
        {
          type: "text",
          text: "Hello world !",
        },
      ],
    };
  });

  return server;
};
