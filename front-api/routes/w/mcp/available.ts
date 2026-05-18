import { Hono } from "hono";

import type { MCPServerType } from "@app/lib/api/mcp";
import { DefaultRemoteMCPServerInMemoryResource } from "@app/lib/resources/default_remote_mcp_server_in_memory_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: MCPServerType[];
};

// Mounted under /api/w/:wId/mcp/available.
export const availableApp = new Hono();

availableApp.get("/", async (c) => {
  const auth = c.get("auth");

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

  return c.json({
    success: true,
    servers: [...internalServers, ...defaultRemoteServers],
  });
});
