import type { ApiAppType } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import type { AppType, CoreAPIError, Result } from "@dust-tt/types";
import { CoreAPI, credentialsFromProviders, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import apiConfig from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Dataset, Provider } from "@app/lib/resources/storage/models/apps";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";

export async function importApps(
  auth: Authenticator,
  space: SpaceResource,
  appsToImport: ApiAppType[]
): Promise<Result<AppType[], Error | CoreAPIError>> {
  const owner = auth.getNonNullableWorkspace();
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const apps: AppType[] = [];
  const existingApps = await AppResource.listBySpace(auth, space, {
    includeDeleted: true,
  });

  for (const appToImport of appsToImport) {
    let app = existingApps.find((a) => a.sId === appToImport.sId);
    if (app) {
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
        apps.push(app.toJSON());
      }
    } else {
      // An app with this sId exist, check workspace and space first to see if it matches
      const existingApp = await AppResource.fetchById(auth, appToImport.sId);
      if (existingApp) {
        return new Err(
          new Error("App with this sId already exists in another space.")
        );
      }

      // App does not exist, create a new app
      const p = await coreAPI.createProject();

      if (p.isErr()) {
        return p;
      }
      const dustAPIProject = p.value.project;

      app = await AppResource.makeNew(
        {
          sId: appToImport.sId,
          name: appToImport.name,
          description: appToImport.description,
          visibility: "private",
          dustAPIProjectId: dustAPIProject.project_id.toString(),
          workspaceId: owner.id,
        },
        space
      );

      apps.push(app.toJSON());
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

      const datasetId = Object.keys(latestDatasets)[0];
      if (datasetId) {
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
          datasetId,
          secrets,
          storeBlocksResults: true,
        });

        if (dustRun.isErr()) {
          logger.error(app, "Failed to create run for app");
          return dustRun;
        }

        const appJson = {
          ...app.toJSON(),
          hash: dustRun.value.run.app_hash,
        };

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

        const index = apps.findIndex((a) => a.id === app.id);
        if (index >= 0) {
          apps.splice(index, 1);
        }
        apps.push(appJson);
      }
    }
  }

  return new Ok(apps);
}

export async function synchronizeDustApps(
  auth: Authenticator,
  space: SpaceResource
) {
  if (!apiConfig.getDustAppsSyncEnabled()) {
    return new Ok(false);
  }

  const syncMasterApi = new DustAPI(
    apiConfig.getDustAPIConfig(),
    {
      apiKey: apiConfig.getDustAppsSyncMasterApiKey(), // TODO: Use a secret instead
      workspaceId: apiConfig.getDustAppsSyncMasterWorkspaceId(),
    },
    logger,
    apiConfig.getDustAppsSyncMasterApiUrl()
  );

  const exportRes = await syncMasterApi.exportApps({
    appSpaceId: apiConfig.getDustAppsSyncMasterSpaceId(),
  });

  if (exportRes.isErr()) {
    return exportRes;
  }

  const importRes = await importApps(auth, space, exportRes.value);
  if (importRes.isErr()) {
    return importRes;
  }
  logger.info({ importedApp: importRes.value }, "Apps imported successfully");
  return new Ok(true);
}
