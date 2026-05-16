import { Hono } from "hono";

import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";

// Mounted under /api/w/:wId/mcp/connections.
export const connectionsApp = new Hono();

async function loadConnection(c: any) {
  const auth = c.get("auth");
  const cId = c.req.param("cId");
  return MCPServerConnectionResource.fetchById(auth, cId);
}

connectionsApp.get("/:connectionType/:cId", async (c) => {
  const connectionRes = await loadConnection(c);
  if (connectionRes.isErr()) {
    return c.json(
      {
        error: {
          type: "mcp_server_connection_not_found",
          message: "Connection not found",
        },
      },
      404
    );
  }

  const value: { connection: MCPServerConnectionType } = {
    connection: connectionRes.value.toJSON(),
  };
  return c.json(value);
});

connectionsApp.delete("/:connectionType/:cId", async (c) => {
  const auth = c.get("auth");
  const connectionRes = await loadConnection(c);
  if (connectionRes.isErr()) {
    return c.json(
      {
        error: {
          type: "mcp_server_connection_not_found",
          message: "Connection not found",
        },
      },
      404
    );
  }

  const result = await connectionRes.value.delete(auth);
  if (result.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to delete connection",
        },
      },
      500
    );
  }

  return c.json({ success: true });
});
