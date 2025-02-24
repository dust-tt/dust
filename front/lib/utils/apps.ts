import type { ApiAppType } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import type { CoreAPIError, Result, TraceType } from "@dust-tt/types";
import {
  concurrentExecutor,
  CoreAPI,
  credentialsFromProviders,
  Err,
  Ok,
  removeNulls,
} from "@dust-tt/types";
import { createParser } from "eventsource-parser";
import _ from "lodash";

import { default as config } from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { config as regionConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { BaseDustProdActionRegistry } from "@app/lib/registry";
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
        id: appToImport.id,
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
      if (datasetToImport.schema) {
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
  }
  return new Ok(true);
}

async function updateAppSpecifications(
  auth: Authenticator,
  {
    app,
    savedSpecification,
    coreSpecifications,
    savedConfig,
  }: {
    app: AppResource;
    savedSpecification: string;
    coreSpecifications?: Record<string, string>;
    savedConfig: string;
  }
): Promise<Result<boolean, CoreAPIError | Error>> {
  logger.info({ sId: app.sId, name: app.name }, "Updating app specifications");
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Specification or config have been modified and need to be imported
  if (
    savedSpecification !== app.savedSpecification ||
    savedConfig !== app.savedConfig
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
      const dustRun = await coreAPI.createRunStream(owner, auth.groups(), {
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

      let error = undefined;
      try {
        // Intercept block_execution events to store token usages.
        const parser = createParser((event) => {
          if (event.type === "event") {
            if (event.data) {
              const data = JSON.parse(event.data);
              if (data.type === "block_execution") {
                const traces: TraceType[][] = data.content.execution;
                const errs = traces.flatMap((trace) =>
                  removeNulls(trace.map((t) => t.error))
                );
                if (errs.length > 0) {
                  throw new Error(errs[0]);
                }
              }
            }
          }
        });

        for await (const chunk of dustRun.value.chunkStream) {
          parser.feed(new TextDecoder().decode(chunk));
        }
      } catch (err) {
        if (err instanceof Error) {
          error = err.message;
        } else {
          error = String(err);
        }
      }

      const dustRunId = await dustRun.value.dustRunId;

      // Update app state
      await Promise.all([
        RunResource.makeNew({
          dustRunId,
          appId: app.id,
          runType: "local",
          workspaceId: owner.id,
        }),

        app.updateState(auth, {
          savedSpecification,
          savedConfig,
          savedRun: dustRunId,
        }),
      ]);

      if (error) {
        return new Err(new Error(error));
      }

      return new Ok(true);
    }
  } else {
    logger.info(
      { sId: app.sId, name: app.name },
      "No changes to app specifications"
    );
  }

  if (coreSpecifications) {
    const existingHashes = await coreAPI.getSpecificationHashes({
      projectId: app.dustAPIProjectId,
    });
    if (existingHashes.isOk()) {
      // Remove hashes that already exist in core
      coreSpecifications = _.omit(
        coreSpecifications,
        existingHashes.value.hashes
      );
    }

    await concurrentExecutor(
      Object.values(coreSpecifications),
      async (specification) => {
        await coreAPI.saveSpecification({
          projectId: app.dustAPIProjectId,
          specification: specification,
        });
      },
      { concurrency: 10 }
    );
  }

  return new Ok(false);
}

export async function importApp(
  auth: Authenticator,
  space: SpaceResource,
  appToImport: ApiAppType
): Promise<
  Result<{ app: AppResource; updated: boolean }, CoreAPIError | Error>
> {
  logger.info(
    { sId: appToImport.sId, name: appToImport.name },
    "Importing app"
  );
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
      coreSpecifications: appToImport.coreSpecifications,
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

    const specUpdated = updateSpecificationsRes.value;
    if (updated || specUpdated) {
      logger.info(
        { sId: app.sId, appName: app.name },
        "App imported successfully"
      );
    }

    return new Ok({ app, updated: updated || specUpdated });
  }

  if (updated) {
    logger.info(
      { sId: app.sId, appName: app.name },
      "App imported successfully"
    );
  } else {
    logger.info(
      { sId: app.sId, appName: app.name },
      "App unchanged, no updated needed"
    );
  }
  return new Ok({ app, hash: undefined, updated });
}

interface ImportRes {
  sId: string;
  name: string;
  error?: string;
}

export async function importApps(
  auth: Authenticator,
  space: SpaceResource,
  appsToImport: ApiAppType[]
): Promise<ImportRes[]> {
  const apps: ImportRes[] = [];

  for (const appToImport of appsToImport) {
    const res = await importApp(auth, space, appToImport);
    if (res.isErr()) {
      apps.push({
        sId: appToImport.sId,
        name: appToImport.name,
        error: res.error.message,
      });
    } else {
      const { app, updated } = res.value;
      if (updated) {
        apps.push({ sId: app.sId, name: app.name });
      }
    }
  }

  return apps;
}

export async function getSpecificationsHashesFromCore(app: AppResource) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const coreSpec = await coreAPI.getSpecificationHashes({
    projectId: app.dustAPIProjectId,
  });

  if (coreSpec.isErr()) {
    return null;
  }

  return coreSpec.value.hashes;
}

export async function getSpecificationFromCore(app: AppResource, hash: string) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const coreSpec = await coreAPI.getSpecification({
    projectId: app.dustAPIProjectId,
    specificationHash: hash,
  });

  if (coreSpec.isErr()) {
    return null;
  }

  return coreSpec.value.specification;
}

interface CheckRes {
  deployed: boolean;
  appId: string;
  appHash: string;
}

async function selfCheck(auth: Authenticator): Promise<CheckRes[]> {
  const actions = Object.values(BaseDustProdActionRegistry);
  const appRequest = actions.map((action) => ({
    appId: action.app.appId,
    appHash: action.app.appHash,
  }));
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const apps = await concurrentExecutor(
    appRequest,
    async (appRequest) => {
      const app = await AppResource.fetchById(auth, appRequest.appId);
      if (!app) {
        return { ...appRequest, deployed: false };
      }
      const coreSpec = await coreAPI.getSpecification({
        projectId: app.dustAPIProjectId,
        specificationHash: appRequest.appHash,
      });
      if (coreSpec.isErr()) {
        return { ...appRequest, deployed: false };
      }

      return { ...appRequest, deployed: true };
    },
    { concurrency: 5 }
  );

  return apps;
}

export async function synchronizeDustApps(
  auth: Authenticator,
  space: SpaceResource
): Promise<
  Result<
    {
      importedApp: ImportRes[];
      check: CheckRes[];
    },
    Error | CoreAPIError
  >
> {
  if (!regionConfig.getDustRegionSyncEnabled()) {
    return new Ok({
      importedApp: [],
      check: [],
    });
  }

  const syncMasterApi = new DustAPI(
    config.getDustAPIConfig(),
    {
      apiKey: regionConfig.getDustAppsSyncMasterApiKey(),
      workspaceId: regionConfig.getDustAppsSyncMasterWorkspaceId(),
    },
    logger,
    regionConfig.getDustRegionSyncMasterUrl()
  );

  const exportRes = await syncMasterApi.exportApps({
    appSpaceId: regionConfig.getDustAppsSyncMasterSpaceId(),
  });

  if (exportRes.isErr()) {
    const e = exportRes.error;
    return new Err(new Error(`Cannot export: ${e.message}`));
  }

  logger.info(
    { apps: exportRes.value.map((app) => app.sId) },
    "Got exported apps from master"
  );

  const importRes = await importApps(auth, space, exportRes.value);
  logger.info({ importedApp: importRes }, "Apps imported");

  const selfCheckRes = await selfCheck(auth);
  return new Ok({
    importedApp: importRes,
    check: selfCheckRes.filter((a) => !a.deployed),
  });
}
