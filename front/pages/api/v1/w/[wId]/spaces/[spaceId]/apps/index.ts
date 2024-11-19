import type { GetAppsResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAppsResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { spaceId } = req.query;

  // Handling the case where `spaceId` is undefined to keep support for the legacy endpoint (not under
  // space, global space assumed).
  const space =
    typeof spaceId !== "string"
      ? await SpaceResource.fetchWorkspaceGlobalSpace(auth)
      : await SpaceResource.fetchById(auth, spaceId);

  if (!space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  if (space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const apps = await AppResource.listBySpace(auth, space);

      res.status(200).json({
        apps: apps.map((app) => app.toJSON()),
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
