import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server instance
const server = new McpServer({
  name: "dust-mcp-server",
  version: "1.0.0",
});

// TODO(kyllian): Add tool to ask agent

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("Dust MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
