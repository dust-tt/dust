import { createPlugin } from "@app/lib/api/poke/types";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { Err, Ok } from "@app/types/shared/result";

export const getMCPServerViewAPIKeyPlugin = createPlugin({
  manifest: {
    id: "get-mcp-server-view-api-key",
    name: "Get MCP Server View API Key",
    description:
      "Retrieve the API key for this MCP server view. Only use this with explicit approval from the workspace user.",
    warning:
      "⚠️ This reveals a sensitive credential belonging to the user. Only proceed if you have explicit approval from the customer to access their API key.",
    resourceTypes: ["mcp_server_views"],
    readonly: true,
    args: {},
    redactResult: true,
  },
  execute: async (auth, mcpServerView, _args) => {
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found."));
    }

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
            new Error("This remote MCP server has no API key configured.")
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

        if (!credentials) {
          return new Err(
            new Error(
              "This internal MCP server does not require bearer token authentication."
            )
          );
        }

        if (!credentials.sharedSecret) {
          return new Err(
            new Error("This internal MCP server has no API key configured.")
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
