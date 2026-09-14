import { clearPinnedOAuthScopeForMCPServerViews } from "@app/lib/api/mcp/views";
import type {
  MCPServerConnectionConnectionType,
  MCPServerConnectionType,
} from "@app/lib/resources/mcp_server_connection_resource";
import {
  isMCPServerConnectionConnectionType,
  MCPServerConnectionResource,
} from "@app/lib/resources/mcp_server_connection_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

export type GetConnectionResponseBody = {
  connection: Omit<MCPServerConnectionType, "createdAt" | "updatedAt"> & {
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteConnectionResponseBody = {
  success: boolean;
};

const ParamsSchema = z.object({
  cId: z.string(),
  connectionType: z.string(),
});

// Mounted at /api/w/:wId/mcp/connections/:connectionType/:cId.
const app = workspaceApp();

async function loadConnection(
  ctx: Context,
  cId: string,
  connectionType: MCPServerConnectionConnectionType
) {
  const auth = ctx.get("auth");
  return MCPServerConnectionResource.fetchById(auth, cId, { connectionType });
}

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConnectionResponseBody> => {
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

    const connectionRes = await loadConnection(ctx, cId, connectionType);
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
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DeleteConnectionResponseBody> => {
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

    const connectionRes = await loadConnection(ctx, cId, connectionType);
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

    if (connectionType === "workspace") {
      await clearPinnedOAuthScopeForMCPServerViews(auth, {
        mcpServerId: connectionRes.value.mcpServerId,
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
