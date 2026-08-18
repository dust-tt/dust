import type { GetMonitorableMCPServerViewsResponseBody } from "@app/lib/api/mcp";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { isMonitorableMCPServer } from "@app/lib/triggers/monitorable_mcp_servers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetMonitorableMCPServerViewsResponseBody> => {
    const auth = ctx.get("auth");
    const serverViews = await MCPServerViewResource.listForSystemSpace(auth, {
      includeHeavyAttributes: ["cachedTools"],
    });

    return ctx.json({
      success: true,
      serverViews: serverViews
        .map((serverView) => serverView.toJSON())
        .filter(isMonitorableMCPServer),
    });
  }
);

export default app;
