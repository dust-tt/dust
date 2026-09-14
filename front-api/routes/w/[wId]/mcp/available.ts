import type { GetAvailableMCPServersResponseBody } from "@app/lib/api/mcp";
import { DefaultRemoteMCPServerInMemoryResource } from "@app/lib/resources/default_remote_mcp_server_in_memory_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/mcp/available.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetAvailableMCPServersResponseBody> => {
  const auth = ctx.get("auth");

  const internalServers = (
    await InternalMCPServerInMemoryResource.listAvailableInternalMCPServers(
      auth
    )
  ).map((r) => r.toJSON());

  const defaultRemoteServers = (
    await DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers(
      auth
    )
  ).map((r) => r.toJSON());

  const systemMCPServerViews = await MCPServerViewResource.listForSystemSpace(
    auth,
    {
      isRestrictedToSkills: true,
    }
  );
  const restrictedServerIds = new Set(
    systemMCPServerViews.map((view) => view.mcpServerId)
  );

  return ctx.json({
    success: true,
    servers: [...internalServers, ...defaultRemoteServers].filter(
      (server) => !restrictedServerIds.has(server.sId)
    ),
  });
});

export default app;
