import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import {
  isMCPServerConnectionConnectionType,
  MCPServerConnectionResource,
} from "@app/lib/resources/mcp_server_connection_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  connectionType: z.string(),
});

// Mounted at /api/w/:wId/mcp/connections/:connectionType/:cId.
const app = workspaceApp();

async function loadConnection(ctx: Context, cId: string) {
  const auth = ctx.get("auth");
  return MCPServerConnectionResource.fetchById(auth, cId);
}

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const { cId, connectionType } = ctx.req.valid("param");
  if (!isMCPServerConnectionConnectionType(connectionType)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid connection type",
      },
    });
  }

  const connectionRes = await loadConnection(ctx, cId);
  if (
    connectionRes.isErr() ||
    connectionRes.value.connectionType !== connectionType
  ) {
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

app.delete("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId, connectionType } = ctx.req.valid("param");
  if (!isMCPServerConnectionConnectionType(connectionType)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid connection type",
      },
    });
  }

  const connectionRes = await loadConnection(ctx, cId);
  if (
    connectionRes.isErr() ||
    connectionRes.value.connectionType !== connectionType
  ) {
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
