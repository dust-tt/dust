import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { Err, Ok } from "@app/types/shared/result";

export const getMcpServerViewConnectionMetadataPlugin = createPlugin({
  manifest: {
    id: "get-mcp-server-view-connection-metadata",
    name: "Get MCP Server View Connection Metadata",
    description:
      "Retrieve the OAuth connection metadata (team_id, team_name, etc.) for this MCP server view.",
    resourceTypes: ["mcp_server_views"],
    readonly: true,
    args: {
      userId: {
        type: "string",
        label: "User ID",
        description:
          "User ID to get personal connection metadata for. Leave empty to get the workspace connection metadata.",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    return !!resource;
  },
  execute: async (auth, mcpServerView, args) => {
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found."));
    }

    const { userId } = args;
    const connectionType = userId && userId.trim() ? "personal" : "workspace";

    const connectionsRes = await MCPServerConnectionResource.listByMCPServer(
      auth,
      { mcpServerId: mcpServerView.mcpServerId }
    );

    if (connectionsRes.isErr()) {
      return new Err(
        new Error(
          `Failed to fetch connections: ${connectionsRes.error.message}`
        )
      );
    }

    const connections = connectionsRes.value;
    const oauthConnections = connections.filter((c) => c.connectionId);

    let connection: (typeof oauthConnections)[0] | null = null;

    if (connectionType === "workspace") {
      connection =
        oauthConnections.find((c) => c.connectionType === "workspace") ?? null;
    } else {
      if (!userId.trim()) {
        return new Err(
          new Error("User ID cannot be empty for personal connections.")
        );
      }
      connection =
        oauthConnections.find(
          (c) =>
            c.connectionType === "personal" && c.user?.sId === userId.trim()
        ) ?? null;
    }

    if (!connection) {
      return new Err(
        new Error(
          `No ${connectionType} OAuth connection found${connectionType === "personal" ? ` for user ${userId}` : ""}.`
        )
      );
    }

    if (!connection.connectionId) {
      return new Err(
        new Error(
          `Connection found but has no OAuth connection ID${connectionType === "personal" ? ` for user ${userId}` : ""}.`
        )
      );
    }

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const metadataRes = await oauthApi.getConnectionMetadata({
      connectionId: connection.connectionId,
    });

    if (metadataRes.isErr()) {
      return new Err(
        new Error(
          `Failed to fetch connection metadata: ${metadataRes.error.message}`
        )
      );
    }

    return new Ok({
      display: "json",
      value: metadataRes.value.connection.metadata,
    });
  },
});
