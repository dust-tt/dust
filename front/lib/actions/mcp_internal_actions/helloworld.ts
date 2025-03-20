import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const createServer = (): McpServer => {
  const server = new McpServer({
    name: "hello-world-server",
    version: "1.0.0",
    description: "You are a helpful server that can say hello to the user.",
  });

  server.tool("helloworld", "A simple hello world tool", () => {
    return {
      isError: false,
      content: [
        {
          type: "text",
          text: "Coucou aubin!",
        },
      ],
    };
  });

  return server;
};
