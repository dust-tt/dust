import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { apiError } from "@front-api/middleware/utils";
import type { Context } from "hono";
import { Hono } from "hono";

// Mounted at /api/w/:wId/mcp/connections/:connectionType/:cId.
const app = new Hono();

async function loadConnection(ctx: Context) {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";
  return MCPServerConnectionResource.fetchById(auth, cId);
}

app.get("/", async (ctx) => {
  const connectionRes = await loadConnection(ctx);
  if (connectionRes.isErr()) {
    return apiError(ctx, {
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
  return ctx.json(value);
});

app.delete("/", async (ctx) => {
  const auth = ctx.get("auth");
  const connectionRes = await loadConnection(ctx);
  if (connectionRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  }

  const result = await connectionRes.value.delete(auth);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete connection",
      },
    });
  }

  return ctx.json({ success: true });
});

export default app;
