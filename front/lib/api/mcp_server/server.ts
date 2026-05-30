import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createDustMcpServer(): McpServer {
  const server = new McpServer({
    name: "dust",
    version: "0.1.0",
  });

  // hello_world — smoke-test tool
  // Confirms that a remote client is properly authenticated and talking to Dust.
  server.tool(
    "hello_world",
    "Returns a greeting from Dust. Use this to verify that your MCP client is correctly connected and authenticated.",
    async () => {
      const auth = getAuthenticatorFromMcpContext();
      if (!auth) {
        return {
          content: [{ type: "text", text: "Not authenticated." }],
          isError: true,
        };
      }

      const name = auth.user()?.firstName.trim() || "there";
      const workspaceName = auth.workspace()?.name ?? "unknown workspace";
      return {
        content: [
          {
            type: "text",
            text: `Hello, ${name}! You are connected to the Dust MCP server for workspace "${workspaceName}".`,
          },
        ],
      };
    }
  );

  return server;
}
