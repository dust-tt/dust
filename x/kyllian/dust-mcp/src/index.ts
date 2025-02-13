import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DUST_API_URL = "http://localhost:3000";
// TODO(kyllian): Get the following variables from config
const DUST_ACCESS_TOKEN = "";
const DUST_WORKSPACE_ID = "";
const DUST_AGENT_ID = "";

if (!DUST_ACCESS_TOKEN || !DUST_WORKSPACE_ID || !DUST_AGENT_ID) {
  throw new Error("Dust access token, workspace ID, and agent ID must be set");
}

const dustApi = new DustAPI(
  {
    url: DUST_API_URL,
  },
  {
    apiKey: () => DUST_ACCESS_TOKEN,
    workspaceId: DUST_WORKSPACE_ID,
  },
  console
);

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
