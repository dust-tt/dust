import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { Err, getOAuthConnectionAccessToken, Ok } from "@app/types";

export const getMcpServerViewAccessTokenPlugin = createPlugin({
  manifest: {
    id: "get-mcp-server-view-access-token",
    name: "Get MCP Server View Access Token",
    description: "Retrieve the OAuth access token for this MCP server view.",
    resourceTypes: ["mcp_server_views"],
    args: {
      userId: {
        type: "string",
        label: "User ID",
        description:
          "User ID to get personal access token for. Leave empty to get the workspace token.",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    // Only applicable if the MCP server view exists
    return !!resource;
  },
  execute: async (auth, mcpServerView, args) => {
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found."));
    }

    const { userId } = args;
    const connectionType = userId && userId.trim() ? "personal" : "workspace";

    // Fetch connections for this MCP server
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

    if (connections.length === 0) {
      return new Err(
        new Error(
          `No connections found for this MCP server. The server may not have any OAuth connections set up yet.`
        )
      );
    }
    // Find the appropriate connection
    let connection: (typeof connections)[0] | null = null;
    if (connectionType === "workspace") {
      connection =
        connections.find((conn) => conn.connectionType === "workspace") ?? null;
    } else {
      // For personal connections, find by userId
      if (!userId.trim()) {
        return new Err(
          new Error("User ID cannot be empty for personal connections.")
        );
      }

      connection =
        connections.find(
          (conn) =>
            conn.connectionType === "personal" &&
            conn.user?.sId === userId.trim()
        ) ?? null;
    }

    if (!connection) {
      return new Err(
        new Error(
          `No ${connectionType} connection found${connectionType === "personal" ? ` for user ${userId}` : ""}.`
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

    const tokenRes = await getOAuthConnectionAccessToken({
      config: config.getOAuthAPIConfig(),
      logger,
      connectionId: connection.connectionId,
    });

    if (tokenRes.isErr()) {
      return new Err(
        new Error(`Failed to fetch access token: ${tokenRes.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: tokenRes.value.access_token,
    });
  },
});
