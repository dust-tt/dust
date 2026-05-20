import type { MCPServerViewType } from "@app/lib/api/mcp";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import type { HandlerResult } from "@front-api/middleware/utils";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";
import differenceWith from "lodash/differenceWith";

export type GetMCPServerViewsNotActivatedResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

// Mounted under /api/w/:wId/spaces/:spaceId/mcp_views/not_activated.
const app = new Hono();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetMCPServerViewsNotActivatedResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

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

    return ctx.json({
      success: true,
      serverViews: removeNulls(activableMcpServerViews.map((s) => s.toJSON())),
    });
  }
);

export default app;
