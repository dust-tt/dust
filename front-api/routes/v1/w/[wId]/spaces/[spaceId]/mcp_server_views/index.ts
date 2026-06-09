import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GetMCPServerViewsResponseType } from "@dust-tt/client";
import { GetMCPServerViewsQuerySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/mcp_server_views:
 *   get:
 *     summary: List available MCP server views.
 *     description: Retrieves a list of enabled MCP server views (aka tools) for a specific space of the authenticated workspace.
 *     tags:
 *       - Tools
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: MCP server views of the space
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spaces:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MCPServerView'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       500:
 *         description: Internal Server Error.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/mcp_server_views.
const app = publicApiApp();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("query", GetMCPServerViewsQuerySchema),
  async (ctx): HandlerResult<GetMCPServerViewsResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { includeAuto } = ctx.req.valid("query");

    const mcpServerViews = await MCPServerViewResource.listBySpace(auth, space);
    return ctx.json({
      success: true,
      serverViews: mcpServerViews
        .map((mcpServerView) => mcpServerView.toJSON())
        .filter(
          (s) =>
            s.server.availability === "manual" ||
            (includeAuto && s.server.availability === "auto")
        ),
    });
  }
);

export default app;
