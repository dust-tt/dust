import { AppResource } from "@app/lib/resources/app_resource";
import type { GetAppsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

import aId from "./[aId]";
import check from "./check";
import exportRoute from "./export";
import importRoute from "./import";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/apps:
 *   get:
 *     summary: List apps
 *     description: Get all apps in the space identified by {spaceId}.
 *     tags:
 *       - Apps
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
 *         description: Apps of the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: Unique identifier for the app
 *                       sId:
 *                         type: string
 *                         description: Unique string identifier for the app
 *                       name:
 *                         type: string
 *                         description: Name of the app
 *                       description:
 *                         type: string
 *                         description: Description of the app
 *                       savedSpecification:
 *                         type: string
 *                         description: Saved specification of the app
 *                       savedConfig:
 *                         type: string
 *                         description: Saved configuration of the app
 *                       savedRun:
 *                         type: string
 *                         description: Saved run identifier of the app
 *                       dustAPIProjectId:
 *                         type: string
 *                         description: ID of the associated Dust API project
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
// Mounted at /api/v1/w/:wId/spaces/:spaceId/apps.
const app = publicApiApp();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetAppsResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const apps = await AppResource.listBySpace(auth, space);

    return ctx.json({
      apps: apps.filter((a) => a.canRead(auth)).map((a) => a.toJSON()),
    });
  }
);

app.route("/check", check);
app.route("/export", exportRoute);
app.route("/import", importRoute);
app.route("/:aId", aId);

export default app;
