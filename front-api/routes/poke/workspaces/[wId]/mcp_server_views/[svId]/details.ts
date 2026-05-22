import { mcpServerViewToPokeJSON } from "@app/lib/poke/utils";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { PokeMCPServerViewType } from "@app/types/poke";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";

export type PokeGetMCPServerViewDetails = {
  mcpServerView: PokeMCPServerViewType;
};

// Mounted at /api/poke/workspaces/:wId/mcp_server_views/:svId/details.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeGetMCPServerViewDetails> => {
  const auth = ctx.get("auth");
  const svId = ctx.req.param("svId");
  if (!svId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid MCP server view ID.",
      },
    });
  }

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

  const mcpServerViewJSON = await mcpServerViewToPokeJSON(mcpServerView, auth);

  return ctx.json({ mcpServerView: mcpServerViewJSON });
});

export default app;
