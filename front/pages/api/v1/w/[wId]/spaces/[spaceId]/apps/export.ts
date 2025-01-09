import type { GetAppsResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { getDatasetHash, getDatasets } from "@app/lib/api/datasets";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/apps/export:
 *   get:
 *     summary: Export all apps with datasets
 *     description: Get all apps in the space identified by {spaceId}, with their datasets.
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
 *                       datasets:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             name:
 *                               type: string
 *                               description: Name of the dataset
 *                             description:
 *                               type: string
 *                               description: Description of the dataset
 *                               nullable: true
 *                             data:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 additionalProperties:
 *                                   oneOf:
 *                                     - type: string
 *                                     - type: number
 *                                     - type: boolean
 *                                     - type: object
 *                                       additionalProperties: true
 *                             schema:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   key:
 *                                     type: string
 *                                     description: Key of the schema entry
 *                                   type:
 *                                     type: string
 *                                     description: Type of the schema entry
 *                                   description:
 *                                     type: string
 *                                     description: Description of the schema entry
 *                                     nullable: true
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
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.canReadOrAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const apps = await AppResource.listBySpace(auth, space);

      const enhancedApps = await Promise.all(
        apps
          .filter((app) => app.canRead(auth))
          .map(async (app) => {
            const datasetsFromFront = await getDatasets(auth, app.toJSON());
            const datasets = await Promise.all(
              datasetsFromFront.map(async (dataset) => {
                const fromCore = await getDatasetHash(
                  auth,
                  app,
                  dataset.name,
                  "latest"
                );
                dataset.schema;
                return fromCore || dataset;
              })
            );
            return { ...app.toJSON(), datasets };
          })
      );

      res.status(200).json({
        apps: enhancedApps,
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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
