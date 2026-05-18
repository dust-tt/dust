import differenceWith from "lodash/differenceWith";
import { Hono } from "hono";

import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceKind } from "@app/types/space";

import { spaceResource } from "../../../middleware/space_resource";

// Mounted under /api/w/:wId/spaces/:spaceId/mcp_views.
export const mcpViewsApp = new Hono();

mcpViewsApp.get(
  "/not_activated",
  spaceResource({ requireCanRead: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    const spaceMcpServerViews = await MCPServerViewResource.listBySpace(
      auth,
      space
    );
    const workspaceServerViews =
      await MCPServerViewResource.listByWorkspace(auth);

    // MCP servers that can be added to a space are the ones already
    // activated by the admin (in the system space) but not already in the
    // company (global) space.
    const systemMcpServerViews = workspaceServerViews.filter(
      (s) => s.space.kind === "system"
    );
    const globalMcpServerViews = workspaceServerViews.filter(
      (s) => s.space.kind === "global"
    );

    const activableMcpServerViews = differenceWith(
      systemMcpServerViews,
      spaceMcpServerViews.concat(globalMcpServerViews),
      (a, b) =>
        (a.internalMCPServerId ?? a.remoteMCPServerId) ===
        (b.internalMCPServerId ?? b.remoteMCPServerId)
    );

    return c.json({
      success: true,
      serverViews: removeNulls(activableMcpServerViews.map((s) => s.toJSON())),
    });
  }
);

mcpViewsApp.delete(
  "/:svId",
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
