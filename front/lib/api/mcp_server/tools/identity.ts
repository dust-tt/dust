import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpJsonResponse } from "./response";

export function registerIdentityTool(server: McpServer) {
  server.registerTool(
    "identity",
    {
      description:
        "Returns information about the authenticated user and workspace.",
    },
    async () => {
      const auth = getAuthenticatorFromMcpContext();
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
