import assert from "assert";
import type { WhereOptions } from "sequelize";
import { Op, QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import logger from "@app/logger/logger";
import type { DataSourceCoreIds } from "@app/temporal/relocation/activities/types";
import type { CoreAPIDataSource, ModelId } from "@app/types";
import { CoreAPI } from "@app/types";

const BATCH_SIZE = 100;

export async function retrieveDataSourceCoreIdsBatch({
  lastId,
  workspaceId,
}: {
  lastId?: ModelId;
  workspaceId: string;
}): Promise<{
  dataSourceCoreIds: DataSourceCoreIds[];
  hasMore: boolean;
  lastId: ModelId;
}> {
  const localLogger = logger.child({
    lastId,
    workspaceId,
  });

  localLogger.info("[Core] Retrieving data source core ids");

  const workspace = await getWorkspaceInfos(workspaceId);
  assert(workspace, "Workspace not found.");

  const whereClause: WhereOptions<DataSourceModel> = {
    workspaceId: workspace.id,
  };

  if (lastId) {
    whereClause.id = {
      [Op.gt]: lastId,
    };
  }

  const dataSources = await DataSourceModel.findAll({
    where: whereClause,
    order: [["id", "ASC"]],
    limit: BATCH_SIZE,
    raw: true,
    type: QueryTypes.SELECT,
  });

  localLogger.info(
    { dataSourceCount: dataSources.length },
    "[Core] Retrieved data source core ids"
  );

  return {
    dataSourceCoreIds: dataSources.map((ds) => ({
      id: ds.id,
      dustAPIDataSourceId: ds.dustAPIDataSourceId,
      dustAPIProjectId: ds.dustAPIProjectId,
    })),
    hasMore: dataSources.length === BATCH_SIZE,
    lastId: dataSources[dataSources.length - 1].id,
  };
}

export async function getCoreDataSource({
  dataSourceCoreIds,
  workspaceId,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  workspaceId: string;
}): Promise<CoreAPIDataSource> {
  const localLogger = logger.child({
    dataSourceCoreIds,
    workspaceId,
  });

  localLogger.info("[Core] Retrieving data source");

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const dataSourceRes = await coreAPI.getDataSource({
    projectId: dataSourceCoreIds.dustAPIProjectId,
    dataSourceId: dataSourceCoreIds.dustAPIDataSourceId,
  });

  if (dataSourceRes.isErr()) {
    throw new Error("Failed to retrieve data source");
  }

  const { data_source: dataSource } = dataSourceRes.value;

  return dataSource;
}
