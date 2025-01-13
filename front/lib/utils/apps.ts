import type { ApiAppType } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import type { CoreAPIError, Result } from "@dust-tt/types";
import { CoreAPI, credentialsFromProviders, Err, Ok } from "@dust-tt/types";
import _ from "lodash";

import { default as apiConfig, default as config } from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Dataset, Provider } from "@app/lib/resources/storage/models/apps";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";

async function updateOrCreateApp(
  auth: Authenticator,
  {
    appToImport,
    space,
  }: {
    appToImport: ApiAppType;
    space: SpaceResource;
  }
): Promise<
  Result<{ app: AppResource; updated: boolean }, Error | CoreAPIError>
> {
  const existingApps = await AppResource.listBySpace(auth, space, {
    includeDeleted: true,
  });
  const existingApp = existingApps.find((a) => a.sId === appToImport.sId);
  if (existingApp) {
    // Check if existing app was deleted
    if (existingApp.deletedAt) {
      return new Err(
        new Error("App has been deleted, it can't be reimported.")
      );
    }

    // Now update if name/descriptions have been modified
    if (
      existingApp.name !== appToImport.name ||
      existingApp.description !== appToImport.description
    ) {
      await existingApp.updateSettings(auth, {
        name: appToImport.name,
        description: appToImport.description,
      });
      return new Ok({ app: existingApp, updated: true });
    }
    return new Ok({ app: existingApp, updated: false });
  } else {
    // An app with this sId exist, check workspace and space first to see if it matches
    const existingApp = await AppResource.fetchById(auth, appToImport.sId);
    if (existingApp) {
      return new Err(
        new Error("App with this sId already exists in another space.")
      );
    }

    // App does not exist, create a new app
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const p = await coreAPI.createProject();

    if (p.isErr()) {
      return p;
    }
    const dustAPIProject = p.value.project;

    const owner = auth.getNonNullableWorkspace();
    const newApp = await AppResource.makeNew(
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

    return new Ok({ app: newApp, updated: true });
  }
}

async function updateDatasets(
  auth: Authenticator,
  {
    app,
    datasetsToImport,
  }: {
    app: AppResource;
    datasetsToImport: ApiAppType["datasets"];
  }
): Promise<Result<boolean, CoreAPIError>> {
  if (datasetsToImport) {
    const owner = auth.getNonNullableWorkspace();
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    // Getting all existing datasets for this app
    const existingDatasets = await Dataset.findAll({
      where: {
        workspaceId: owner.id,
        appId: app.id,
      },
    });

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
          !_.isEqual(dataset.schema, datasetToImport.schema) ||
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
  return new Ok(true);
}

async function updateAppSpecifications(
  auth: Authenticator,
  {
    app,
    savedSpecification,
    savedConfig,
  }: {
    app: AppResource;
    savedSpecification: string;
    savedConfig: string;
  }
): Promise<Result<{ updated: boolean; hash?: string }, CoreAPIError>> {
  // Specification and config have been modified and need to be imported
  if (
    savedSpecification !== app.savedSpecification &&
    savedConfig !== app.savedConfig
  ) {
    // Fetch all datasets from core for this app
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
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

    const [datasetId] = Object.keys(latestDatasets);
    if (datasetId) {
      const owner = auth.getNonNullableWorkspace();
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
          JSON.parse(savedSpecification),
          latestDatasets
        ),
        config: { blocks: JSON.parse(savedConfig) },
        credentials: credentialsFromProviders(providers),
        datasetId,
        secrets,
        storeBlocksResults: true,
      });

      if (dustRun.isErr()) {
        logger.error(app, "Failed to create run for app");
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
          savedSpecification,
          savedConfig,
          savedRun: dustRun.value.run.run_id,
        }),
      ]);

      return new Ok({
        hash: dustRun.value.run.app_hash ?? undefined,
        updated: true,
      });
    }
  }
  return new Ok({ updated: false, hash: undefined });
}

export async function importApp(
  auth: Authenticator,
  space: SpaceResource,
  appToImport: ApiAppType
): Promise<
  Result<
    { app: AppResource; hash?: string; updated: boolean },
    CoreAPIError | Error
  >
> {
  const appRes = await updateOrCreateApp(auth, {
    appToImport,
    space,
  });
  if (appRes.isErr()) {
    logger.error(
      { sId: appToImport.sId, name: appToImport.name, error: appRes.error },
      "Error when importing app config"
    );
    return appRes;
  }

  const { app, updated } = appRes.value;

  const datasetsRes = await updateDatasets(auth, {
    app,
    datasetsToImport: appToImport.datasets,
  });
  if (datasetsRes.isErr()) {
    logger.error(
      {
        sId: app.sId,
        name: app.name,
        error: datasetsRes.error,
      },
      "Error when importing app datasets"
    );
    return datasetsRes;
  }

  if (appToImport.savedSpecification && appToImport.savedConfig) {
    const updateSpecificationsRes = await updateAppSpecifications(auth, {
      app,
      savedSpecification: appToImport.savedSpecification,
      savedConfig: appToImport.savedConfig,
    });
    if (updateSpecificationsRes.isErr()) {
      logger.error(
        {
          sId: app.sId,
          name: app.name,
          error: updateSpecificationsRes.error,
        },
        "Error when importing app specifications"
      );
      return updateSpecificationsRes;
    }

    const { hash, updated: specUpdated } = updateSpecificationsRes.value;

    if (updated || specUpdated) {
      logger.info(
        { sId: app.sId, appName: app.name, hash },
        "App imported successfully"
      );
    }

    return new Ok({ app, hash, updated: updated || specUpdated });
  }

  if (updated) {
    logger.info(
      { sId: app.sId, appName: app.name },
      "App imported successfully"
    );
  }
  return new Ok({ app, hash: undefined, updated });
}

interface ImportRes {
  sId: string;
  name: string;
  hash?: string;
}

export async function importApps(
  auth: Authenticator,
  space: SpaceResource,
  appsToImport: ApiAppType[]
): Promise<Result<ImportRes[], Error | CoreAPIError>> {
  const apps: ImportRes[] = [];

  for (const appToImport of appsToImport) {
    const res = await importApp(auth, space, appToImport);
    if (res.isErr()) {
      return res;
    }
    const { app, hash, updated } = res.value;
    if (updated) {
      apps.push({ sId: app.sId, name: app.name, hash });
    }
  }

  return new Ok(apps);
}

export async function synchronizeDustApps(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<ImportRes[], Error | CoreAPIError>> {
  if (!apiConfig.getDustAppsSyncEnabled()) {
    return new Ok([]);
  }

  const syncMasterApi = new DustAPI(
    apiConfig.getDustAPIConfig(),
    {
      apiKey: apiConfig.getDustAppsSyncMasterApiKey(),
      workspaceId: apiConfig.getDustAppsSyncMasterWorkspaceId(),
    },
    logger,
    apiConfig.getDustAppsSyncMasterApiUrl()
  );

  const exportRes = await syncMasterApi.exportApps({
    appSpaceId: apiConfig.getDustAppsSyncMasterSpaceId(),
  });

  if (exportRes.isErr()) {
    const e = exportRes.error;
    return new Err(new Error(`Cannot export: ${e.message}`));
  }

  const importRes = await importApps(auth, space, exportRes.value);
  if (importRes.isErr()) {
    return importRes;
  }
  logger.info({ importedApp: importRes.value }, "Apps imported successfully");
  return importRes;
}
