import { apiError } from "@front-api/middleware/utils";
import type { Context } from "hono";
import { Hono } from "hono";

import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";

// Mounted at /api/w/:wId/mcp/connections/:connectionType/:cId.
const app = new Hono();

async function loadConnection(c: Context) {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";
  return MCPServerConnectionResource.fetchById(auth, cId);
}

app.get("/", async (c) => {
  const connectionRes = await loadConnection(c);
  if (connectionRes.isErr()) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  }

  const value: { connection: MCPServerConnectionType } = {
    connection: connectionRes.value.toJSON(),
  };
  return c.json(value);
});

app.delete("/", async (c) => {
  const auth = c.get("auth");
  const connectionRes = await loadConnection(c);
  if (connectionRes.isErr()) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  }

  const result = await connectionRes.value.delete(auth);
  if (result.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete connection",
      },
    });
  }

  return c.json({ success: true });
});

export default app;
