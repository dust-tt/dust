import type { MCPServerType } from "@app/lib/api/mcp";
import { DefaultRemoteMCPServerInMemoryResource } from "@app/lib/resources/default_remote_mcp_server_in_memory_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: MCPServerType[];
};

// Mounted at /api/w/:wId/mcp/available.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetMCPServersResponseBody> => {
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

  return ctx.json({
    success: true,
    servers: [...internalServers, ...defaultRemoteServers],
  });
});

export default app;
