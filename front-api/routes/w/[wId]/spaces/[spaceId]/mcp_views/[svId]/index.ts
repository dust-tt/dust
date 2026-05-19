import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceKind } from "@app/types/space";

import { spaceResource } from "@front-api/middleware/space_resource";

// Mounted under /api/w/:wId/spaces/:spaceId/mcp_views/:svId.
const app = new Hono();

app.delete(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const serverViewId = c.req.param("svId") ?? "";

    if (!auth.isUser()) {
      return apiError(c, {
        status_code: 401,
        api_error: {
          type: "mcp_auth_error",
          message:
            "You are not authorized to make request to inspect an MCP server.",
        },
      });
    }

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      serverViewId
    );
    if (!mcpServerView || mcpServerView.space.id !== space.id) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "MCP Server View not found",
        },
      });
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Can only delete MCP Server Views from regular or global spaces.",
        },
      });
    }

    if (!auth.isAdmin()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "mcp_auth_error",
          message: "User is not authorized to remove tools from a space.",
        },
      });
    }

    await mcpServerView.delete(auth, { hardDelete: true });

    return c.json({ deleted: true });
  }
);

export default app;
