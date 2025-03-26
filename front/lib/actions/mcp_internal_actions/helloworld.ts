import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const serverInfo = {
  name: "hello-world-server",
  version: "1.0.0",
  description: "You are a helpful server that can say hello to the user.",
  authorization: {
    provider: "google_drive" as const,
    use_case: "connection" as const,
  },
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

export const helloWorldServer = {
  createServer,
  serverInfo,
};
