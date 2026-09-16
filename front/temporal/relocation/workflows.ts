import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type * as connectorsDestinationActivities from "@app/temporal/relocation/activities/destination_region/connectors/sql";
import type * as coreDestinationActivities from "@app/temporal/relocation/activities/destination_region/core";
import type * as frontDestinationActivities from "@app/temporal/relocation/activities/destination_region/front";
import type * as connectorsSourceActivities from "@app/temporal/relocation/activities/source_region/connectors/sql";
import type * as coreSourceActivities from "@app/temporal/relocation/activities/source_region/core";
import type * as frontSourceActivities from "@app/temporal/relocation/activities/source_region/front";
import type {
  CreateDataSourceProjectResult,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import {
  CORE_API_LIST_NODES_BATCH_SIZE,
  CORE_API_LIST_TABLES_BATCH_SIZE,
} from "@app/temporal/relocation/activities/types";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import type { CellType } from "@app/types/cell";
import type { ModelId } from "@app/types/shared/model_id";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

const CHUNK_SIZE = 3000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 10_000;
const TEMPORAL_CORE_DATA_SOURCE_RELOCATION_CONCURRENCY = 20;

const INITIAL_BACKOFF_DELAY_MS = 1000;
const MAX_BACKOFF_DELAY_MS = 60_000;

interface RelocationWorkflowBase {
  sourceCell: CellType;
  destCell: CellType;
  workspaceId: string;
}

export async function workspaceRelocationWorkflow({
  sourceCell,
  destCell,
  workspaceId,
}: RelocationWorkflowBase) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  // Both front and connectors workflows can run in parallel.
  const workflowDetails = [
    {
      workflow: workspaceRelocateFrontWorkflow,
      name: "workspaceRelocateFrontWorkflow",
    },
    {
      workflow: workspaceRelocateConnectorsWorkflow,
      name: "workspaceRelocateConnectorsWorkflow",
    },
  ];

  await concurrentExecutor(
    workflowDetails,
    async (w) => {
      await executeChild(w.workflow, {
        workflowId: `${w.name}-${workspaceId}`,
        searchAttributes: parentSearchAttributes,
        args: [{ sourceCell, destCell, workspaceId }],
        memo,
      });
    },
    { concurrency: 2 }
  );

  // 3) Relocate the core data source documents to the destination cell.
  await executeChild(workspaceRelocateCoreWorkflow, {
    workflowId: `workspaceRelocateCoreWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [{ sourceCell, destCell, workspaceId }],
  });

  // 4) Relocate the apps to the destination cell.
  await executeChild(workspaceRelocateAppsWorkflow, {
    workflowId: `workspaceRelocateAppsWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        workspaceId,
        sourceCell,
        destCell,
      },
    ],
    memo,
  });
}

/**
 * Front relocation workflows.
 */

const getFrontSourceCellActivities = (cell: CellType) => {
  return proxyActivities<typeof frontSourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_CELL[cell],
  });
};

const getFrontDestinationCellActivities = (cell: CellType) => {
  return proxyActivities<typeof frontDestinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_CELL[cell],
  });
};

export async function workspaceRelocateFrontWorkflow({
  sourceCell,
  destCell,
  workspaceId,
}: RelocationWorkflowBase) {
  const sourceCellActivities = getFrontSourceCellActivities(sourceCell);
  const destinationCellActivities = getFrontDestinationCellActivities(destCell);

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  // 1) Relocate the workspace, users and plan in the destination cell.
  const coreEntitiesDataPath =
    await sourceCellActivities.readCoreEntitiesFromSourceRegion({
      destCell,
      sourceCell,
      workspaceId,
    });

  await destinationCellActivities.writeCoreEntitiesToDestinationRegionWithIdNormalization(
    {
      dataPath: coreEntitiesDataPath,
      destCell,
      sourceCell,
      workspaceId,
    }
  );

  const tablesOrder =
    await sourceCellActivities.getTablesWithWorkspaceIdOrder();

  // 2) Relocate front tables to the destination cell.
  for (const tableName of tablesOrder) {
    await executeChild(workspaceRelocateFrontTableWorkflow, {
      workflowId: `workspaceRelocateFrontTableWorkflow-${workspaceId}-${tableName}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          sourceCell,
          tableName,
          destCell,
          workspaceId,
        },
      ],
      memo,
    });
  }

  // 3) Relocate the associated files from the file storage to the destination cell.
  await executeChild(workspaceRelocateFrontFileStorageWorkflow, {
    workflowId: `workspaceRelocateFrontFileStorageWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        sourceCell,
        destCell,
        workspaceId,
      },
    ],
  });

  // 4) Recreate Elasticsearch indices in the destination cell.
  await executeChild(workspaceRelocateFrontEsIndexationWorkflow, {
    workflowId: `workspaceRelocateFrontEsIndexationWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        sourceCell,
        destCell,
        workspaceId,
      },
    ],
    memo,
  });
}

export async function workspaceRelocateFrontTableWorkflow({
  lastProcessedId,
  sourceCell,
  tableName,
  destCell,
  workspaceId,
}: RelocationWorkflowBase & {
  tableName: string;
  lastProcessedId?: ModelId;
}) {
  // Create activity proxies with dynamic task queues.
  const sourceCellActivities = getFrontSourceCellActivities(sourceCell);
  const destinationCellActivities = getFrontDestinationCellActivities(destCell);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;
  let limit: number | null = null;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateFrontTableWorkflow>({
        sourceCell,
        destCell,
        workspaceId,
        tableName,
        lastProcessedId: currentId,
      });
    }

    const {
      dataPath,
      hasMore,
      lastId,
      nextLimit,
    }: Awaited<ReturnType<typeof frontSourceActivities.readFrontTableChunk>> =
      await sourceCellActivities.readFrontTableChunk({
        lastId: currentId,
        workspaceId,
        tableName,
        sourceCell,
        destCell,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        limit: limit || CHUNK_SIZE,
      });

    if (dataPath) {
      await destinationCellActivities.processFrontTableChunkWithIdNormalization(
        {
          dataPath,
          destCell,
          sourceCell,
          tableName,
          workspaceId,
        }
      );
    }

    hasMoreRows = hasMore;
    currentId = lastId;
    limit = nextLimit;
  } while (hasMoreRows);
}

export async function workspaceRelocateFrontFileStorageWorkflow({
  sourceCell,
  destCell,
  workspaceId,
}: RelocationWorkflowBase) {
  const sourceCellActivities = getFrontSourceCellActivities(sourceCell);
  const destinationCellActivities = getFrontDestinationCellActivities(destCell);

  // 1) Relocate public files.
  const destPublicBucket =
    await destinationCellActivities.getDestinationPublicBucket();

  const publicFilesJobName =
    await sourceCellActivities.startTransferFrontPublicFiles({
      destBucket: destPublicBucket,
      destCell,
      sourceCell,
      workspaceId,
    });

  // Wait for the file storage transfer to complete.
  let isPublicFilesTransferComplete = false;
  while (!isPublicFilesTransferComplete) {
    isPublicFilesTransferComplete =
      await sourceCellActivities.isFileStorageTransferComplete({
        jobName: publicFilesJobName,
      });

    if (!isPublicFilesTransferComplete) {
      // Sleep for 1 minute before checking again.
      await sleep("1m");
    }
  }

  // 2) Relocate private files.
  const destPrivateBucket =
    await destinationCellActivities.getDestinationPrivateBucket();

  const privateFilesJobName =
    await sourceCellActivities.startTransferFrontPrivateFiles({
      destBucket: destPrivateBucket,
      destCell,
      sourceCell,
      workspaceId,
    });

  // Wait for the file storage transfer to complete.
  let isPrivateFilesTransferComplete = false;
  while (!isPrivateFilesTransferComplete) {
    isPrivateFilesTransferComplete =
      await sourceCellActivities.isFileStorageTransferComplete({
        jobName: privateFilesJobName,
      });

    if (!isPrivateFilesTransferComplete) {
      // Sleep for 1 minute before checking again.
      await sleep("1m");
    }
  }
}

export async function workspaceRelocateFrontEsIndexationWorkflow({
  destCell,
  workspaceId,
}: RelocationWorkflowBase) {
  const destinationCellActivities = getFrontDestinationCellActivities(destCell);

  // Recreate user search index.
  await destinationCellActivities.recreateUserSearchIndex({ workspaceId });
}

/**
 * Connectors relocation workflows.
 */

const getConnectorsSourceCellActivities = (cell: CellType) => {
  return proxyActivities<typeof connectorsSourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_CELL[cell],
  });
};

const getConnectorsDestinationCellActivities = (cell: CellType) => {
  return proxyActivities<typeof connectorsDestinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_CELL[cell],
  });
};

export async function workspaceRelocateConnectorsWorkflow({
  sourceCell,
  destCell,
  workspaceId,
}: RelocationWorkflowBase) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceCellActivities = getConnectorsSourceCellActivities(sourceCell);
  const destinationCellActivities =
    getConnectorsDestinationCellActivities(destCell);

  // 1) List all connectors in the workspace.
  const { connectors, dataPath } =
    await sourceCellActivities.getAllConnectorsForWorkspace({
      workspaceId,
    });

  // 2) Relocate connectors entries to the destination cell.
  await destinationCellActivities.processConnectorsTableChunk({
    dataPath,
    destCell,
    sourceCell,
    tableName: "connectors",
    workspaceId,
  });

  // 3) Relocate connectors tables to the destination cell for each connector.
  for (const c of connectors) {
    await executeChild(workspaceRelocateConnectorWorkflow, {
      workflowId: `workspaceRelocateConnectorWorkflow-${workspaceId}-${c.id}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          connectorId: c.id,
          destCell,
          sourceCell,
          workspaceId,
        },
      ],
      memo,
    });
  }
}

export async function workspaceRelocateConnectorWorkflow({
  connectorId,
  sourceCell,
  destCell,
  workspaceId,
}: RelocationWorkflowBase & { connectorId: ModelId }) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceCellActivities = getConnectorsSourceCellActivities(sourceCell);

  const tablesOrder =
    await sourceCellActivities.getTablesWithConnectorIdOrder();

  for (const tableName of tablesOrder) {
    await executeChild(workspaceRelocateConnectorsTableWorkflow, {
      workflowId: `workspaceRelocateConnectorsTableWorkflow-${workspaceId}-${tableName}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          connectorId,
          destCell,
          sourceCell,
          tableName,
          workspaceId,
        },
      ],
      memo,
    });
  }
}

export async function workspaceRelocateConnectorsTableWorkflow({
  connectorId,
  lastProcessedId,
  sourceCell,
  tableName,
  destCell,
  workspaceId,
}: RelocationWorkflowBase & {
  connectorId: ModelId;
  tableName: string;
  lastProcessedId?: ModelId;
}) {
  const sourceCellActivities = getConnectorsSourceCellActivities(sourceCell);
  const destinationCellActivities =
    getConnectorsDestinationCellActivities(destCell);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateConnectorsTableWorkflow>({
        connectorId,
        sourceCell,
        destCell,
        workspaceId,
        tableName,
        lastProcessedId: currentId,
      });
    }

    const { dataPath, hasMore, lastId } =
      await sourceCellActivities.readConnectorsTableChunk({
        connectorId,
        lastId: currentId,
        limit: CHUNK_SIZE,
        workspaceId,
        tableName,
        sourceCell,
        destCell,
      });

    hasMoreRows = hasMore;
    currentId = lastId;

    // If there are no more rows, we can skip the rest of the table.
    if (!dataPath) {
      continue;
    }

    await destinationCellActivities.processConnectorsTableChunk({
      connectorId,
      dataPath,
      destCell,
      sourceCell,
      tableName,
      workspaceId,
    });
  } while (hasMoreRows);
}

/**
 * Core relocation workflows.
 */

const getCoreSourceCellActivities = (cell: CellType) => {
  return proxyActivities<typeof coreSourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_CELL[cell],
  });
};

const getCoreDestinationCellActivities = (cell: CellType) => {
  return proxyActivities<typeof coreDestinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_CELL[cell],
  });
};

export async function workspaceRelocateCoreWorkflow({
  destCell,
  lastProcessedId,
  sourceCell,
  workspaceId,
}: RelocationWorkflowBase & { lastProcessedId?: ModelId }) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceCellActivities = getCoreSourceCellActivities(sourceCell);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateCoreWorkflow>({
        destCell,
        lastProcessedId: currentId,
        sourceCell,
        workspaceId,
      });
    }

    const { dataSourceCoreIds, hasMore, lastId } =
      await sourceCellActivities.retrieveDataSourceCoreIdsBatch({
        lastId: currentId,
        workspaceId,
      });

    hasMoreRows = hasMore;
    currentId = lastId;

    await concurrentExecutor(
      dataSourceCoreIds,
      async (dsc) =>
        executeChild(workspaceRelocateDataSourceCoreWorkflow, {
          workflowId: `workspaceRelocateDataSourceCoreWorkflow-${workspaceId}-${dsc.id}`,
          searchAttributes: parentSearchAttributes,
          args: [
            {
              dataSourceCoreIds: dsc,
              destCell,
              sourceCell,
              workspaceId,
            },
          ],
          memo,
        }),
      { concurrency: TEMPORAL_CORE_DATA_SOURCE_RELOCATION_CONCURRENCY }
    );
  } while (hasMoreRows);
}

// TODO: Below is not idempotent, we need to handle the case where the data source is already created in the destination cell.
export async function workspaceRelocateDataSourceCoreWorkflow({
  dataSourceCoreIds,
  destCell,
  sourceCell,
  workspaceId,
}: RelocationWorkflowBase & { dataSourceCoreIds: DataSourceCoreIds }) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceCellActivities = getCoreSourceCellActivities(sourceCell);
  const destinationCellActivities = getCoreDestinationCellActivities(destCell);

  // 1) Get the data source from the source cell.
  const sourceCoreDataSource = await sourceCellActivities.getCoreDataSource({
    dataSourceCoreIds,
    workspaceId,
  });

  // 2) Create the project and data source in the destination cell.
  const destIds = await destinationCellActivities.createDataSourceProject({
    destCell,
    sourceCoreDataSource,
    workspaceId,
  });

  // 3) Update the data source in the destination cell with the new core ids.
  await destinationCellActivities.updateDataSourceCoreIds({
    dataSourceCoreIds,
    destIds,
    workspaceId,
  });

  await executeChild(workspaceRelocateCoreDataSourceResourcesWorkflow, {
    workflowId: `workspaceRelocateCoreDataSourceResourcesWorkflow-${workspaceId}-${dataSourceCoreIds.dustAPIDataSourceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        dataSourceCoreIds,
        destIds,
        destCell,
        pageCursor: null,
        sourceCell,
        workspaceId,
      },
    ],
    memo,
  });
}

export async function workspaceRelocateCoreDataSourceResourcesWorkflow({
  dataSourceCoreIds,
  destIds,
  destCell,
  pageCursor,
  sourceCell,
  workspaceId,
}: RelocationWorkflowBase & {
  destIds: CreateDataSourceProjectResult;
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
}) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const resourcesRelocationWorkflows = [
    {
      fn: workspaceRelocateDataSourceDocumentsWorkflow,
      workflowId: "workspaceRelocateDataSourceDocumentsWorkflow",
    },
    {
      fn: workspaceRelocateDataSourceFoldersWorkflow,
      workflowId: "workspaceRelocateDataSourceFoldersWorkflow",
    },
    {
      fn: workspaceRelocateDataSourceTablesWorkflow,
      workflowId: "workspaceRelocateDataSourceTablesWorkflow",
    },
    {
      fn: workspaceRelocateTableStorageWorkflow,
      workflowId: "workspaceRelocateTableStorageWorkflow",
    },
  ];

  await concurrentExecutor(
    resourcesRelocationWorkflows,
    async (w) => {
      await executeChild(w.fn, {
        workflowId: `${w.workflowId}-${workspaceId}-${dataSourceCoreIds.dustAPIDataSourceId}`,
        searchAttributes: parentSearchAttributes,
        args: [
          {
            dataSourceCoreIds,
            destIds,
            destCell,
            pageCursor,
            sourceCell,
            workspaceId,
          },
        ],
        memo,
      });
    },
    { concurrency: resourcesRelocationWorkflows.length }
  );
}

export async function workspaceRelocateDataSourceDocumentsWorkflow({
  dataSourceCoreIds,
  destIds,
  destCell,
  pageCursor: initialPageCursor,
  sourceCell,
  workspaceId,
}: RelocationWorkflowBase & {
  destIds: CreateDataSourceProjectResult;
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
}) {
  const sourceCellActivities = getCoreSourceCellActivities(sourceCell);
  const destinationCellActivities = getCoreDestinationCellActivities(destCell);

  let pageCursor: string | null = initialPageCursor;
  let limit: number | null = null;
  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateDataSourceDocumentsWorkflow>({
        dataSourceCoreIds,
        destIds,
        destCell,
        pageCursor,
        sourceCell,
        workspaceId,
      });
    }

    const {
      dataPath,
      nextPageCursor,
      nextLimit,
    }: Awaited<ReturnType<typeof coreSourceActivities.getDataSourceDocuments>> =
      await sourceCellActivities.getDataSourceDocuments({
        pageCursor,
        dataSourceCoreIds,
        sourceCell,
        workspaceId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        limit: limit || CORE_API_LIST_NODES_BATCH_SIZE,
      });

    if (dataPath) {
      const sourceApiBaseUrl = await sourceCellActivities.getRegionApiBaseUrl();

      await destinationCellActivities.processDataSourceDocuments({
        destIds,
        dataPath,
        destCell,
        sourceCell,
        sourceApiBaseUrl,
        workspaceId,
      });
    }

    pageCursor = nextPageCursor;
    limit = nextLimit;
  } while (pageCursor);
}

export async function workspaceRelocateDataSourceFoldersWorkflow({
  dataSourceCoreIds,
  destIds,
  destCell,
  pageCursor: initialPageCursor,
  sourceCell,
  workspaceId,
}: RelocationWorkflowBase & {
  destIds: CreateDataSourceProjectResult;
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
}) {
  const sourceCellActivities = getCoreSourceCellActivities(sourceCell);
  const destinationCellActivities = getCoreDestinationCellActivities(destCell);

  let pageCursor: string | null = initialPageCursor;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateDataSourceFoldersWorkflow>({
        dataSourceCoreIds,
        destIds,
        destCell,
        pageCursor,
        sourceCell,
        workspaceId,
      });
    }

    const { dataPath, nextPageCursor } =
      await sourceCellActivities.getDataSourceFolders({
        pageCursor,
        dataSourceCoreIds,
        sourceCell,
        workspaceId,
      });

    const sourceApiBaseUrl = await sourceCellActivities.getRegionApiBaseUrl();

    await destinationCellActivities.processDataSourceFolders({
      destIds,
      dataPath,
      destCell,
      sourceCell,
      sourceApiBaseUrl,
      workspaceId,
    });

    pageCursor = nextPageCursor;
  } while (pageCursor);
}

export async function workspaceRelocateDataSourceTablesWorkflow({
  dataSourceCoreIds,
  destIds,
  destCell,
  pageCursor: initialPageCursor,
  sourceCell,
  workspaceId,
}: RelocationWorkflowBase & {
  destIds: CreateDataSourceProjectResult;
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
}) {
  const sourceCellActivities = getCoreSourceCellActivities(sourceCell);
  const destinationCellActivities = getCoreDestinationCellActivities(destCell);

  let pageCursor: string | null = initialPageCursor;
  let limit: number | null = null;
  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateDataSourceTablesWorkflow>({
        dataSourceCoreIds,
        destIds,
        destCell,
        pageCursor,
        sourceCell,
        workspaceId,
      });
    }

    const {
      dataPath,
      nextPageCursor,
      nextLimit,
    }: Awaited<ReturnType<typeof coreSourceActivities.getDataSourceTables>> =
      await sourceCellActivities.getDataSourceTables({
        pageCursor,
        dataSourceCoreIds,
        sourceCell,
        workspaceId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        limit: limit || CORE_API_LIST_TABLES_BATCH_SIZE,
      });
    if (dataPath) {
      const sourceApiBaseUrl = await sourceCellActivities.getRegionApiBaseUrl();

      await destinationCellActivities.processDataSourceTables({
        destIds,
        dataPath,
        destCell,
        sourceCell,
        sourceApiBaseUrl,
        workspaceId,
      });
    }

    pageCursor = nextPageCursor;
    limit = nextLimit;
  } while (pageCursor);
}

export async function workspaceRelocateTableStorageWorkflow({
  dataSourceCoreIds,
  destIds,
  destCell,
  sourceCell,
  workspaceId,
}: RelocationWorkflowBase & {
  dataSourceCoreIds: DataSourceCoreIds;
  destIds: CreateDataSourceProjectResult;
}) {
  const sourceCellActivities = getFrontSourceCellActivities(sourceCell);
  const destinationCellActivities = getFrontDestinationCellActivities(destCell);

  // 1) Relocate tables files.
  const destTablesBucket =
    await destinationCellActivities.getDestinationTablesBucket();

  const tableFilesJobName =
    await sourceCellActivities.startTransferCoreTableFiles({
      dataSourceCoreIds,
      destBucket: destTablesBucket,
      destIds,
      destCell,
      sourceCell,
      workspaceId,
    });

  // Wait for the file storage transfer to complete.
  let isTableFilesTransferComplete = false;
  let backoffDelayMs = INITIAL_BACKOFF_DELAY_MS;
  while (!isTableFilesTransferComplete) {
    isTableFilesTransferComplete =
      await sourceCellActivities.isFileStorageTransferComplete({
        jobName: tableFilesJobName,
      });

    if (!isTableFilesTransferComplete) {
      await sleep(backoffDelayMs);
      backoffDelayMs = Math.min(backoffDelayMs * 2, MAX_BACKOFF_DELAY_MS);
    }
  }
}

export async function workspaceRelocateAppsWorkflow({
  workspaceId,
  lastProcessedId,
  sourceCell,
  destCell,
}: RelocationWorkflowBase & { lastProcessedId?: ModelId }) {
  const sourceCellActivities = getCoreSourceCellActivities(sourceCell);
  const destinationCellActivities = getCoreDestinationCellActivities(destCell);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    const { dustAPIProjectIds, hasMore, lastId } =
      await sourceCellActivities.retrieveAppsCoreIdsBatch({
        lastId: currentId,
        workspaceId,
      });

    hasMoreRows = hasMore;
    currentId = lastId;

    for (const dustAPIProjectId of dustAPIProjectIds) {
      const { dataPath } = await sourceCellActivities.getApp({
        dustAPIProjectId,
        workspaceId,
        sourceCell,
      });

      await destinationCellActivities.processApp({
        dustAPIProjectId,
        dataPath,
        destCell,
        sourceCell,
        workspaceId,
      });
    }
  } while (hasMoreRows);
}

export async function workspaceRelocateAppWorkflow({
  workspaceId,
  sourceCell,
  destCell,
  dustAPIProjectId,
}: RelocationWorkflowBase & { dustAPIProjectId: string }) {
  const sourceCellActivities = getCoreSourceCellActivities(sourceCell);
  const destinationCellActivities = getCoreDestinationCellActivities(destCell);

  const { dataPath } = await sourceCellActivities.getApp({
    dustAPIProjectId,
    workspaceId,
    sourceCell,
  });

  await destinationCellActivities.processApp({
    dustAPIProjectId,
    dataPath,
    destCell,
    sourceCell,
    workspaceId,
  });
}
