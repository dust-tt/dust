// We use the public API to call the Dust Apps, it's okay here.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { ApiAppImportType, ApiAppType } from "@dust-tt/client";
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DustAPI } from "@dust-tt/client";
import _ from "lodash";

import { default as config } from "@app/lib/api/config";
import { getDatasetHash, getDatasets } from "@app/lib/api/datasets";
import { config as regionConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { BaseDustProdActionRegistry } from "@app/lib/registry";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Dataset } from "@app/lib/resources/storage/models/apps";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { CoreAPIError, Result } from "@app/types";
import { CoreAPI, Err, Ok } from "@app/types";

async function updateOrCreateApp(
  auth: Authenticator,
  {
    appToImport,
    space,
  }: {
    appToImport: ApiAppImportType;
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
    datasetsToImport: ApiAppImportType["datasets"];
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
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    await app.updateState(auth, {
      savedSpecification,
      savedConfig,
    });
  } else {
    logger.info(
      { sId: app.sId, name: app.name },
      "No changes to front app specifications"
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

    if (Object.keys(coreSpecifications).length > 0) {
      logger.info(
        {
          sId: app.sId,
          name: app.name,
          hashes: Object.keys(coreSpecifications),
        },
        "Updating core app specifications"
      );

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

      return new Ok(true);
    }
  }
  return new Ok(false);
}

export async function importApp(
  auth: Authenticator,
  space: SpaceResource,
  appToImport: ApiAppImportType
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
  appsToImport: ApiAppImportType[]
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

export const extractDatasetIdsAndHashes = (specification: string) => {
  const dataSetsToFetch: { datasetId: string; hash: string }[] = [];
  const dataBlockMatch = specification.match(
    /data [^\n]+\s*{\s*dataset_id:\s*([^\n]+)\s*hash:\s*([^\n]+)\s*}/
  );
  if (dataBlockMatch) {
    const [, datasetId, hash] = dataBlockMatch;
    dataSetsToFetch.push({ datasetId, hash });
  }
  return dataSetsToFetch;
};

export async function exportApps(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<ApiAppType[], Error>> {
  const apps = await AppResource.listBySpace(auth, space);

  const enhancedApps = await concurrentExecutor(
    apps.filter((app) => app.canRead(auth)),

    async (app) => {
      const specsToFetch = await getSpecificationsHashesFromCore(
        app.dustAPIProjectId
      );

      const dataSetsToFetch = (await getDatasets(auth, app.toJSON())).map(
        (ds) => ({ datasetId: ds.name, hash: "latest" })
      );

      const coreSpecifications: { [key: string]: string } = {};

      if (specsToFetch) {
        for (const hash of specsToFetch) {
          const coreSpecification = await getSpecificationFromCore(
            app.dustAPIProjectId,
            hash
          );
          if (coreSpecification) {
            // Parse dataset_id and hash from specification if it contains DATA section
            dataSetsToFetch.push(
              ...extractDatasetIdsAndHashes(coreSpecification.data)
            );

            coreSpecifications[hash] = coreSpecification.data;
          }
        }
      }
      const datasets = [];
      for (const dataset of dataSetsToFetch) {
        const fromCore = await getDatasetHash(
          auth,
          app,
          dataset.datasetId,
          dataset.hash,
          { includeDeleted: true }
        );
        if (fromCore) {
          datasets.push(fromCore);
        }
      }

      return { ...app.toJSON(), datasets, coreSpecifications };
    },
    { concurrency: 5 }
  );
  return new Ok(enhancedApps);
}

export async function getSpecificationsHashesFromCore(
  dustAPIProjectId: string
) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const coreSpec = await coreAPI.getSpecificationHashes({
    projectId: dustAPIProjectId,
  });

  if (coreSpec.isErr()) {
    return null;
  }

  return coreSpec.value.hashes;
}

export async function getSpecificationFromCore(
  dustAPIProjectId: string,
  hash: string
) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const coreSpec = await coreAPI.getSpecification({
    projectId: dustAPIProjectId,
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
