import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import spaceId from "./[spaceId]";

export type GetPublicSpacesResponseBody = {
  spaces: SpaceType[];
};

// Mounted at /api/v1/w/:wId/spaces. publicApiAuth is applied by the parent
// v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

app.route("/:spaceId", spaceId);

/**
 * @swagger
 * /api/v1/w/{wId}/spaces:
 *   get:
 *     summary: List available spaces.
 *     description: Retrieves a list of accessible spaces for the authenticated workspace.
 *     tags:
 *       - Spaces
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Spaces of the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spaces:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Space'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       500:
 *         description: Internal Server Error.
 */

app.get("/", async (ctx): HandlerResult<GetPublicSpacesResponseBody> => {
  const auth = ctx.get("auth");

  const allSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const spaces = allSpaces.filter((space) => space.kind !== "conversations");

  return ctx.json({
    spaces: spaces.map((space) => space.toJSON()),
  });
});

export default app;
