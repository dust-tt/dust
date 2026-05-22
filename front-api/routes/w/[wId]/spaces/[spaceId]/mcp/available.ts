import type { MCPServerType } from "@app/lib/api/mcp";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { withSpace } from "@front-api/middleware/with_space";

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: MCPServerType[];
};

// Mounted under /api/w/:wId/spaces/:spaceId/mcp/available.
//
// Lists MCP servers available to add to the space — i.e. servers that exist
// in the workspace but are not yet attached to this space nor to the global
// space.
const app = workspaceApp();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetMCPServersResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const [
      internalInstalledServers,
      remoteInstalledServers,
      workspaceServerViews,
    ] = await Promise.all([
      InternalMCPServerInMemoryResource.listByWorkspace(auth),
      RemoteMCPServerResource.listByWorkspace(auth),
      MCPServerViewResource.listByWorkspace(auth),
    ]);

    const globalServersId = workspaceServerViews
      .filter((s) => s.space.kind === "global")
      .map((s) => s.toJSON().server.sId);

    const spaceServerViews = workspaceServerViews.filter(
      (s) => s.space.id === space.id
    );
    const spaceServersId = spaceServerViews.map((s) => s.toJSON().server.sId);

    const availableServer: MCPServerType[] = [];

    for (const srv of internalInstalledServers) {
      if (
        !spaceServersId.includes(srv.id) &&
        !globalServersId.includes(srv.id)
      ) {
        availableServer.push(srv.toJSON());
      }
    }

    for (const srv of remoteInstalledServers) {
      if (
        !spaceServersId.includes(srv.sId) &&
        !globalServersId.includes(srv.sId)
      ) {
        availableServer.push(srv.toJSON());
      }
    }

    return ctx.json({
      success: true,
      servers: availableServer,
    });
  }
);

export default app;
