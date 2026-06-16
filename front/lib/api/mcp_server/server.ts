import config from "@app/lib/api/config";
import { registerDustMcpTools } from "@app/lib/api/mcp_server/tools";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Icon } from "@modelcontextprotocol/sdk/types.js";

const DUST_LOGO_SQUARE_SVG_PATH =
  "/static/landing/logos/dust/Dust_LogoSquare.svg";
const DUST_LOGO_SQUARE_PNG_PATH =
  "/static/landing/logos/dust/Dust_LogoSquare.png";

function getDustMcpServerIcons(): Icon[] {
  const appUrl = config.getAppUrl();
  return [
    {
      src: `${appUrl}${DUST_LOGO_SQUARE_SVG_PATH}`,
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
    {
      src: `${appUrl}${DUST_LOGO_SQUARE_PNG_PATH}`,
      mimeType: "image/png",
      sizes: ["48x48"],
    },
  ];
}

const DUST_MCP_SERVER_INSTRUCTIONS = `Dust MCP server — programmatic access to a Dust workspace for external clients (Cursor, Claude Desktop, etc.).

Every call is scoped to the authenticated Dust user and workspace.

## Key concepts

- **Workspace**: the Dust organization you signed into. All tools operate within it.
- **Conversation**: a chat thread with Dust agents. Conversations can live at workspace level or inside a Pod. Each has its own file system for attachments and generated files.
- **Pod**: a Dust project space — shared context with a description, tasks, linked company-data nodes, conversations, and files.
- **File system**: scoped paths such as \`conversation-<id>/...\` or \`pod-<id>/...\`.
- **Search**: semantic search across all globally accessible Spaces in the workspace.`;

export function createDustMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "Dust",
      version: "1.0",
      description:
        "Dust is where people and agents collaborate as co-contributors, so that work doesn't just get done – it gets rewired.",
      websiteUrl: config.getStaticWebsiteUrl(),
      icons: getDustMcpServerIcons(),
    },
    { instructions: DUST_MCP_SERVER_INSTRUCTIONS }
  );

  registerDustMcpTools(server);

  return server;
}
