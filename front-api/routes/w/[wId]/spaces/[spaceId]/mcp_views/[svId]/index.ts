import { Hono } from "hono";

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
      return c.json(
        {
          error: {
            type: "mcp_auth_error",
            message:
              "You are not authorized to make request to inspect an MCP server.",
          },
        },
        401
      );
    }

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      serverViewId
    );
    if (!mcpServerView || mcpServerView.space.id !== space.id) {
      return c.json(
        {
          error: {
            type: "data_source_not_found",
            message: "MCP Server View not found",
          },
        },
        404
      );
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Can only delete MCP Server Views from regular or global spaces.",
          },
        },
        400
      );
    }

    if (!auth.isAdmin()) {
      return c.json(
        {
          error: {
            type: "mcp_auth_error",
            message: "User is not authorized to remove tools from a space.",
          },
        },
        403
      );
    }

    await mcpServerView.delete(auth, { hardDelete: true });

    return c.json({ deleted: true });
  }
);

export default app;
