import { createPlugin } from "@app/lib/api/poke/types";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { Err, Ok } from "@app/types/shared/result";

export const getMcpUrlPlugin = createPlugin({
  manifest: {
    id: "update-mcp-url",
    name: "Update MCP Server URL",
    description: "View the current URL of a remote MCP server and update it.",
    warning:
      "⚠️ Only use this to update the URL of the same MCP server (e.g. domain migration, path change). Do NOT use this to point to a completely different MCP server.",
    resourceTypes: ["mcp_server_views"],
    args: {
      url: {
        type: "string",
        label: "URL",
        description: "The URL of the MCP server.",
        async: true,
      },
    },
  },
  isApplicableTo: (_auth, resource) => {
    return !!resource && resource.serverType === "remote";
  },
  populateAsyncArgs: async (auth, mcpServerView) => {
    if (!mcpServerView || !mcpServerView.remoteMCPServerId) {
      return new Err(new Error("MCP server view not found."));
    }

    const remoteServer = await RemoteMCPServerResource.findByPk(
      auth,
      mcpServerView.remoteMCPServerId
    );

    if (!remoteServer) {
      return new Err(new Error("Remote MCP server not found."));
    }

    return new Ok({
      url: remoteServer.url,
    });
  },
  execute: async (auth, mcpServerView, args) => {
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found."));
    }

    if (mcpServerView.serverType !== "remote") {
      return new Err(
        new Error("This plugin is only applicable to remote MCP servers.")
      );
    }

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

    const { url } = args;
    const previousUrl = remoteServer.url;

    if (url.trim() === previousUrl) {
      return new Ok({
        display: "text",
        value: "URL unchanged.",
      });
    }

    await remoteServer.updateUrl(auth, url.trim());

    return new Ok({
      display: "text",
      value: "URL updated successfully.",
    });
  },
});
