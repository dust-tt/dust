import type { CoreAPIDataSource } from "@dust-tt/types";
import { CoreAPI, dustManagedCredentials } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import logger from "@app/logger/logger";
import type {
  CreateDataSourceProjectResult,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";

export async function createDataSourceProject({
  destRegion,
  sourceRegionCoreDataSource,
  workspaceId,
}: {
  destRegion: RegionType;
  sourceRegionCoreDataSource: CoreAPIDataSource;
  workspaceId: string;
}): Promise<CreateDataSourceProjectResult> {
  const localLogger = logger.child({
    destRegion,
    workspaceId,
  });

  localLogger.info("[Core] Creating data source project.");

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);
  const dustProject = await coreAPI.createProject();
  if (dustProject.isErr()) {
    localLogger.error(
      { error: dustProject.error },
      "[Core] Failed to create internal project for the data source."
    );

    throw new Error("Failed to create internal project for the data source.");
  }

  const dustDataSource = await coreAPI.createDataSource({
    projectId: dustProject.value.project.project_id.toString(),
    config: sourceRegionCoreDataSource.config,
    credentials: dustManagedCredentials(),
    name: sourceRegionCoreDataSource.name,
  });

  if (dustDataSource.isErr()) {
    localLogger.error(
      { error: dustDataSource.error },
      "[Core] Failed to create the data source."
    );

    throw new Error("Failed to create the data source.");
  }

  localLogger.info("[Core] Created project and data source.");

  return {
    dustAPIProjectId: dustProject.value.project.project_id.toString(),
    dustAPIDataSourceId: dustDataSource.value.data_source.data_source_id,
  };
}

export async function updateDataSourceCoreIds({
  dataSourceCoreIds,
  destIds,
  workspaceId,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  destIds: CreateDataSourceProjectResult;
  workspaceId: string;
}) {
  const localLogger = logger.child({
    dataSourceCoreIds,
    workspaceId,
  });

  localLogger.info("[Core] Updating data source core ids");

  const dataSource = await DataSourceModel.findOne({
    where: {
      id: dataSourceCoreIds.id,
    },
  });

  if (!dataSource) {
    localLogger.error("[Core] Data source not found");
    throw new Error("Data source not found");
  }

  await dataSource.update({
    dustAPIDataSourceId: destIds.dustAPIDataSourceId,
    dustAPIProjectId: destIds.dustAPIProjectId,
  });

  localLogger.info("[Core] Updated data source core ids");
}
