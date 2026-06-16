import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpJsonResponse } from "./response";

export function registerIdentityTool(server: McpServer) {
  registerDustMcpTool(
    server,
    "identity",
    {
      description:
        "Returns information about the authenticated user and workspace.",
    },
    async (auth) => {
      const user = auth.user();
      const workspace = auth.workspace();

      const name = user.firstName.trim() || "there";
      const workspaceName = workspace.name ?? "unknown workspace";
      return mcpJsonResponse({
        id: user.sId,
        name,
        workspaceId: workspace.sId,
        workspaceName,
      });
    }
  );
}
