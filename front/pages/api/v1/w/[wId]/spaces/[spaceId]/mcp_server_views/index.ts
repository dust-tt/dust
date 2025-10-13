import type { GetMCPServerViewsResponseType } from "@dust-tt/client";
import { GetMCPServerViewsQuerySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { WithAPIErrorResponse } from "@app/types";

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
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServerViewsResponseType>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const { includeAuto } = GetMCPServerViewsQuerySchema.parse(req.query);

      const mcpServerViews = await MCPServerViewResource.listBySpace(
        auth,
        space
      );
      return res.status(200).json({
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
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
