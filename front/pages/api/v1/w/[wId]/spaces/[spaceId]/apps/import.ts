import type { ApiAppType, GetAppsResponseType } from "@dust-tt/client";
import { PostAppsRequestSchema } from "@dust-tt/client";
import type {
  AppType,
  CoreAPIError,
  LightWorkspaceType,
  Result,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { CoreAPI, credentialsFromProviders, Err, Ok } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Dataset, Provider } from "@app/lib/resources/storage/models/apps";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/apps/import:
 *   post:
 *     summary: Import apps
 *     description: Import apps in the space identified by {spaceId}.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Unique identifier for the app
 *                     sId:
 *                       type: string
 *                       description: Unique string identifier for the app
 *                     name:
 *                       type: string
 *                       description: Name of the app
 *                     description:
 *                       type: string
 *                       description: Description of the app
 *                     savedSpecification:
 *                       type: string
 *                       description: Saved specification of the app
 *                     savedConfig:
 *                       type: string
 *                       description: Saved configuration of the app
 *                     savedRun:
 *                       type: string
 *                       description: Saved run identifier of the app
 *                     dustAPIProjectId:
 *                       type: string
 *                       description: ID of the associated Dust API project
 *                     datasets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             description: Name of the dataset
 *                           description:
 *                             type: string
 *                             description: Description of the dataset
 *                             nullable: true
 *                           data:
 *                             type: array
 *                             items:
 *                               type: object
 *                               additionalProperties:
 *                                 oneOf:
 *                                   - type: string
 *                                   - type: number
 *                                   - type: boolean
 *                                   - type: object
 *                                     additionalProperties: true
 *                           schema:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 key:
 *                                   type: string
 *                                   description: Key of the schema entry
 *                                 type:
 *                                   type: string
 *                                   description: Type of the schema entry
 *                                 description:
 *                                   type: string
 *                                   description: Description of the schema entry
 *                                   nullable: true
 *     responses:
 *       200:
 *         description: Imported apps
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
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const r = PostAppsRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }
      const result = await importApps(auth, space, r.data.apps);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      return res.status(200).json({ apps: result.value });

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

async function importApps(
  auth: Authenticator,
  space: SpaceResource,
  appsToImport: ApiAppType[]
): Promise<Result<AppType[], Error | CoreAPIError>> {
  const owner = auth.getNonNullableWorkspace();
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const apps: AppResource[] = [];
  const existingApps = await AppResource.listBySpace(auth, space, {
    includeDeleted: true,
  });

  for (const appToImport of appsToImport) {
    let app = existingApps.find((a) => a.sId === appToImport.sId);
    if (app) {
      // An app with this sId exist, check workspace and space first to see if it matches
      if (app?.workspaceId !== owner.id) {
        return new Err(
          new Error("App already exist and does not belong to this workspace")
        );
      }
      if (app?.space.sId !== space.sId) {
        return new Err(
          new Error("App already exist and does not belong to this space")
        );
      }

      // If existing app was deleted, undelete it
      if (app.deletedAt) {
        const undelete = await app.undelete();
        if (undelete.isErr()) {
          return undelete;
        }
      }

      // Now update if name/descriptions have been modified
      if (
        app.name !== appToImport.name ||
        app.description !== appToImport.description
      ) {
        await app.updateSettings(auth, {
          name: appToImport.name,
          description: appToImport.description,
        });
      }
      apps.push(app);
    } else {
      // App does not exist, create a new app
      const r = await createApp(owner, appToImport, space, coreAPI);
      if (r.isErr()) {
        return r;
      }
      app = r.value;
      apps.push(app);
    }

    // Getting all existing datasets for this app
    const existingDatasets = await Dataset.findAll({
      where: {
        workspaceId: owner.id,
        appId: app.id,
      },
    });

    const datasetsToImport = appToImport.datasets;
    if (datasetsToImport) {
      for (const datasetToImport of datasetsToImport) {
        // First, create or update the dataset in core
        const coreDataset = await coreAPI.createDataset({
          projectId: app.dustAPIProjectId,
          datasetId: datasetToImport.name,
          data: datasetToImport.data || [],
        });
        if (coreDataset.isErr()) {
          return coreDataset;
        }

        // Now update the dataset in front if it exists, or create one
        const dataset = existingDatasets.find(
          (d) => d.name === datasetToImport.name
        );
        if (dataset) {
          if (
            dataset.schema !== datasetToImport.schema ||
            dataset.description !== datasetToImport.description
          ) {
            await dataset.update({
              description: datasetToImport.description,
              schema: datasetToImport.schema,
            });
          }
        } else {
          await Dataset.create({
            name: datasetToImport.name,
            description: datasetToImport.description,
            appId: app.id,
            workspaceId: owner.id,
            schema: datasetToImport.schema,
          });
        }
      }
    }

    // Specification and config have been modified and need to be imported
    if (
      appToImport.savedSpecification &&
      appToImport.savedConfig &&
      appToImport.savedSpecification !== app.savedSpecification &&
      appToImport.savedConfig !== app.savedConfig
    ) {
      // Fetch all datasets from core for this app
      const coreDatasets = await coreAPI.getDatasets({
        projectId: app.dustAPIProjectId,
      });
      if (coreDatasets.isErr()) {
        return coreDatasets;
      }

      const latestDatasets: { [key: string]: string } = {};
      for (const d in coreDatasets.value.datasets) {
        latestDatasets[d] = coreDatasets.value.datasets[d][0].hash;
      }

      // Fetch providers and secrets
      const [providers, secrets] = await Promise.all([
        Provider.findAll({
          where: {
            workspaceId: owner.id,
          },
        }),
        getDustAppSecrets(auth, true),
      ]);

      // Create a new run to save specifications and configs
      const dustRun = await coreAPI.createRun(owner, auth.groups(), {
        projectId: app.dustAPIProjectId,
        runType: "local",
        specification: dumpSpecification(
          JSON.parse(appToImport.savedSpecification),
          latestDatasets
        ),
        config: { blocks: JSON.parse(appToImport.savedConfig) },
        credentials: credentialsFromProviders(providers),
        datasetId: Object.keys(latestDatasets)[0] || undefined,
        secrets,
        storeBlocksResults: true,
      });

      if (dustRun.isErr()) {
        return dustRun;
      }

      // Update app state
      await Promise.all([
        RunResource.makeNew({
          dustRunId: dustRun.value.run.run_id,
          appId: app.id,
          runType: "local",
          workspaceId: owner.id,
        }),
        app.updateState(auth, {
          savedSpecification: appToImport.savedSpecification,
          savedConfig: appToImport.savedConfig,
          savedRun: dustRun.value.run.run_id,
        }),
      ]);
    }
  }

  return new Ok(apps.map((a) => a.toJSON()));
}

async function createApp(
  owner: LightWorkspaceType,
  app: ApiAppType,
  space: SpaceResource,
  coreAPI: CoreAPI
) {
  const p = await coreAPI.createProject();

  if (p.isErr()) {
    return p;
  }
  const dustAPIProject = p.value.project;
  return new Ok(
    await AppResource.makeNew(
      {
        sId: app.sId,
        name: app.name,
        description: app.description,
        visibility: "private",
        dustAPIProjectId: dustAPIProject.project_id.toString(),
        workspaceId: owner.id,
      },
      space
    )
  );
}
