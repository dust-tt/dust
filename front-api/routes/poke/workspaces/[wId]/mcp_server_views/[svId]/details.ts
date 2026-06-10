import type { PokeGetMCPServerViewDetails } from "@app/lib/api/poke/mcp_server_views";
import { mcpServerViewToPokeJSON } from "@app/lib/poke/utils";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  svId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/mcp_server_views/:svId/details.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetMCPServerViewDetails> => {
    const auth = ctx.get("auth");
    const { svId } = ctx.req.valid("param");

    const mcpServerView = await MCPServerViewResource.fetchById(auth, svId);
    if (!mcpServerView) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_view_not_found",
          message: "MCP server view not found.",
        },
      });
    }

    const mcpServerViewJSON = await mcpServerViewToPokeJSON(
      mcpServerView,
      auth
    );

    const allViews = await MCPServerViewResource.listByMCPServer(
      auth,
      mcpServerView.mcpServerId
    );
    const spaceViews = allViews
      .filter((view) => view.space.kind !== "system")
      .map((view) => {
        const json = view.toJSON();
        return {
          sId: view.sId,
          spaceId: view.space.sId,
          space: {
            sId: view.space.sId,
            name: view.space.name,
            kind: view.space.kind,
          },
          createdAt: json.createdAt,
          editedBy: json.editedByUser?.fullName ?? null,
          editedAt: json.editedByUser?.editedAt ?? null,
        };
      });

    return ctx.json({ mcpServerView: mcpServerViewJSON, spaceViews });
  }
);

export default app;
