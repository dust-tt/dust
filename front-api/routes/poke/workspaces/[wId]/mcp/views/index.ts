import type { MCPServerViewType } from "@app/lib/api/mcp";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PokeListMCPServerViews = {
  serverViews: MCPServerViewType[];
};

const QuerySchema = z.object({
  globalSpaceOnly: z.enum(["true", "false"]).optional(),
});

// Mounted at /api/poke/workspaces/:wId/mcp/views.
const app = pokeApp();

app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeListMCPServerViews> => {
    const auth = ctx.get("auth");
    const { globalSpaceOnly } = ctx.req.valid("query");

    let mcpServerViews: MCPServerViewResource[];
    if (globalSpaceOnly === "true") {
      const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
      mcpServerViews = await MCPServerViewResource.listBySpace(
        auth,
        globalSpace
      );
    } else {
      mcpServerViews = await MCPServerViewResource.listByWorkspace(auth);
    }

    return ctx.json({
      serverViews: mcpServerViews.map((sv) => sv.toJSON()),
    });
  }
);

export default app;
