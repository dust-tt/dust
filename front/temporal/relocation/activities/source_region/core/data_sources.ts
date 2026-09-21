import { config as cellConfig } from "@app/lib/api/cells/config";
import config from "@app/lib/api/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import logger from "@app/logger/logger";
import type { DataSourceCoreIds } from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import { CoreAPI } from "@app/types/core/core_api";
import type { CoreAPIDataSource } from "@app/types/core/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import { activityInfo } from "@temporalio/activity";
import assert from "assert";
import type { WhereOptions } from "sequelize";
import { Op, QueryTypes } from "sequelize";

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

  // Keep pagination based on the unfiltered batch, including batches containing
  // only conversation data sources. An empty final batch must also be safe.
  const batchLastId = dataSources.at(-1)?.id ?? lastId ?? 0;
  // Intentionally defer both legacy and filesystem-mode conversation sources.
  // Their front rows and files still relocate; legacy core retrieval needs backfill.
  const skippedDataSources = dataSources.filter(
    (ds) => ds.conversationId !== null
  );
  const dataSourcesToRelocate = dataSources.filter(
    (ds) => ds.conversationId === null
  );

  if (skippedDataSources.length > 0) {
    const { workflowExecution } = activityInfo();
    // Persist before acknowledging the batch so a failed write retries rather
    // than losing the backfill inventory. Retries overwrite the same manifest;
    // distinct workflow runs cannot overwrite each other's inventory.
    const dataPath = await writeToRelocationStorage(
      {
        workspaceId,
        sourceCell: cellConfig.getCurrentCell().name,
        workflowExecution,
        dataSources: skippedDataSources.map((ds) => ({
          id: ds.id,
          conversationId: ds.conversationId,
          dustAPIDataSourceId: ds.dustAPIDataSourceId,
          dustAPIProjectId: ds.dustAPIProjectId,
        })),
      },
      {
        workspaceId,
        type: "core",
        operation: "skipped_conversation_data_sources",
        fileName: `${workflowExecution.runId}/${lastId ?? 0}-${batchLastId}`,
      }
    );

    localLogger.warn(
      {
        dataPath,
        skippedDataSourceCount: skippedDataSources.length,
        batchLastId,
      },
      "[Core] Skipping conversation data sources; backfill manifest saved"
    );
  }

  localLogger.info(
    {
      dataSourceCount: dataSources.length,
      dataSourceCountToRelocate: dataSourcesToRelocate.length,
      skippedDataSourceCount: skippedDataSources.length,
    },
    "[Core] Retrieved data source core ids"
  );

  return {
    dataSourceCoreIds: dataSourcesToRelocate.map((ds) => ({
      id: ds.id,
      dustAPIDataSourceId: ds.dustAPIDataSourceId,
      dustAPIProjectId: ds.dustAPIProjectId,
    })),
    hasMore: dataSources.length === BATCH_SIZE,
    lastId: batchLastId,
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
