import config from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import { createPlugin } from "@app/lib/api/poke/types";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";

export const getMcpServerViewAccessTokenPlugin = createPlugin({
  manifest: {
    id: "get-mcp-server-view-access-token",
    name: "Get MCP Server View Credentials",
    description:
      "Retrieve the OAuth access token or API key for this MCP server view. Only use this with explicit approval from the workspace user.",
    warning:
      "⚠️ This reveals a sensitive credential belonging to the user. Only proceed if you have explicit approval from the customer to access their credentials.",
    resourceTypes: ["mcp_server_views"],
    readonly: true,
    args: {
      userId: {
        type: "string",
        label: "User ID",
        description:
          "User ID to get personal OAuth token for. Leave empty to get the workspace token. Not applicable for API keys.",
      },
    },
    redactResult: true,
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

    // Try OAuth first: find connections with a connectionId.
    const oauthConnections = connections.filter((c) => c.connectionId);

    if (oauthConnections.length > 0) {
      let connection: (typeof oauthConnections)[0] | null = null;

      if (connectionType === "workspace") {
        connection =
          oauthConnections.find((c) => c.connectionType === "workspace") ??
          null;
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
    }

    // Fall back to API key (sharedSecret) on the server.
    switch (mcpServerView.serverType) {
      case "remote": {
        if (!mcpServerView.remoteMCPServerId) {
          return new Err(new Error("Remote MCP server view has no server ID."));
        }

        const remoteServer = await RemoteMCPServerResource.findByPk(
          auth,
          mcpServerView.remoteMCPServerId
        );

        if (!remoteServer) {
          return new Err(new Error("Remote MCP server not found."));
        }

        if (!remoteServer.sharedSecret) {
          return new Err(
            new Error(
              "No credentials found: this remote MCP server has no OAuth connection or API key configured."
            )
          );
        }

        return new Ok({
          display: "text",
          value: remoteServer.sharedSecret,
        });
      }

      case "internal": {
        if (!mcpServerView.internalMCPServerId) {
          return new Err(
            new Error("Internal MCP server view has no server ID.")
          );
        }

        const credentials =
          await InternalMCPServerInMemoryResource.fetchDecryptedCredentials(
            auth,
            mcpServerView.internalMCPServerId
          );

        if (!credentials?.sharedSecret) {
          return new Err(
            new Error(
              "No credentials found: this internal MCP server has no OAuth connection or API key configured."
            )
          );
        }

        return new Ok({
          display: "text",
          value: credentials.sharedSecret,
        });
      }
    }
  },
});
