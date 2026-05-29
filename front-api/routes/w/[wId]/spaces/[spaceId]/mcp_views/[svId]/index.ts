import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceKind } from "@app/types/space";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  svId: z.string(),
});

export type DeleteMCPServerViewResponseBody = {
  deleted: boolean;
};

// Mounted under /api/w/:wId/spaces/:spaceId/mcp_views/:svId.
const app = workspaceApp();

app.delete(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<DeleteMCPServerViewResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { svId: serverViewId } = ctx.req.valid("param");

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      serverViewId
    );
    if (!mcpServerView || mcpServerView.space.id !== space.id) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "MCP Server View not found",
        },
      });
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Can only delete MCP Server Views from regular or global spaces.",
        },
      });
    }

    await mcpServerView.delete(auth, { hardDelete: true });

    return ctx.json({ deleted: true });
  }
);

export default app;
