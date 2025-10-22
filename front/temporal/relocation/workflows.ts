import {
  continueAsNew,
  executeChild,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type { RegionType } from "@app/lib/api/regions/config";
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
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import type { ModelId } from "@app/types";

const CHUNK_SIZE = 3000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 10_000;
const TEMPORAL_CORE_DATA_SOURCE_RELOCATION_CONCURRENCY = 20;

interface RelocationWorkflowBase {
  sourceRegion: RegionType;
  destRegion: RegionType;
  workspaceId: string;
}

export async function workspaceRelocationWorkflow({
  sourceRegion,
  destRegion,
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
        args: [{ sourceRegion, destRegion, workspaceId }],
        memo,
      });
    },
    { concurrency: 2 }
  );

  // 3) Relocate the core data source documents to the destination region.
  await executeChild(workspaceRelocateCoreWorkflow, {
    workflowId: `workspaceRelocateCoreWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [{ sourceRegion, destRegion, workspaceId }],
  });

  // 4) Relocate the apps to the destination region.
  await executeChild(workspaceRelocateAppsWorkflow, {
    workflowId: `workspaceRelocateAppsWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        workspaceId,
        sourceRegion,
        destRegion,
      },
    ],
    memo,
  });
}

/**
 * Front relocation workflows.
 */

const getFrontSourceRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof frontSourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

const getFrontDestinationRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof frontDestinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

export async function workspaceRelocateFrontWorkflow({
  sourceRegion,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const sourceRegionActivities = getFrontSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getFrontDestinationRegionActivities(destRegion);

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  // 1) Relocate the workspace, users and plan in the destination region.
  const coreEntitiesDataPath =
    await sourceRegionActivities.readCoreEntitiesFromSourceRegion({
      destRegion,
      sourceRegion,
      workspaceId,
    });

  await destinationRegionActivities.writeCoreEntitiesToDestinationRegion({
    dataPath: coreEntitiesDataPath,
    destRegion,
    sourceRegion,
    workspaceId,
  });

  const tablesOrder =
    await sourceRegionActivities.getTablesWithWorkspaceIdOrder();

  // 2) Relocate front tables to the destination region.
  for (const tableName of tablesOrder) {
    await executeChild(workspaceRelocateFrontTableWorkflow, {
      workflowId: `workspaceRelocateFrontTableWorkflow-${workspaceId}-${tableName}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          sourceRegion,
          tableName,
          destRegion,
          workspaceId,
        },
      ],
      memo,
    });
  }

  // 3) Relocate the associated files from the file storage to the destination region.
  await executeChild(workspaceRelocateFrontFileStorageWorkflow, {
    workflowId: `workspaceRelocateFrontFileStorageWorkflow-${workspaceId}`,
    searchAttributes: parentSearchAttributes,
    args: [
      {
        sourceRegion,
        destRegion,
        workspaceId,
      },
    ],
  });
}

export async function workspaceRelocateFrontTableWorkflow({
  lastProcessedId,
  sourceRegion,
  tableName,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase & {
  tableName: string;
  lastProcessedId?: ModelId;
}) {
  // Create activity proxies with dynamic task queues.
  const sourceRegionActivities = getFrontSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getFrontDestinationRegionActivities(destRegion);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;
  let limit: number | null = null;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateFrontTableWorkflow>({
        sourceRegion,
        destRegion,
        workspaceId,
        tableName,
        lastProcessedId: currentId,
      });
    }

    const { dataPath, hasMore, lastId, nextLimit } =
      await sourceRegionActivities.readFrontTableChunk({
        lastId: currentId,
        workspaceId,
        tableName,
        sourceRegion,
        destRegion,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        limit: limit || CHUNK_SIZE,
      });

    if (dataPath) {
      await destinationRegionActivities.processFrontTableChunk({
        dataPath,
        destRegion,
        sourceRegion,
        tableName,
        workspaceId,
      });
    }

    hasMoreRows = hasMore;
    currentId = lastId;
    limit = nextLimit;
  } while (hasMoreRows);
}

export async function workspaceRelocateFrontFileStorageWorkflow({
  sourceRegion,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const sourceRegionActivities = getFrontSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getFrontDestinationRegionActivities(destRegion);

  // 1) Relocate public files.
  const destPublicBucket =
    await destinationRegionActivities.getDestinationPublicBucket();

  const publicFilesJobName =
    await sourceRegionActivities.startTransferFrontPublicFiles({
      destBucket: destPublicBucket,
      destRegion,
      sourceRegion,
      workspaceId,
    });

  // Wait for the file storage transfer to complete.
  let isPublicFilesTransferComplete = false;
  while (!isPublicFilesTransferComplete) {
    isPublicFilesTransferComplete =
      await sourceRegionActivities.isFileStorageTransferComplete({
        jobName: publicFilesJobName,
      });

    if (!isPublicFilesTransferComplete) {
      // Sleep for 1 minute before checking again.
      await sleep("1m");
    }
  }

  // 2) Relocate private files.
  const destPrivateBucket =
    await destinationRegionActivities.getDestinationPrivateBucket();

  const privateFilesJobName =
    await sourceRegionActivities.startTransferFrontPrivateFiles({
      destBucket: destPrivateBucket,
      destRegion,
      sourceRegion,
      workspaceId,
    });

  // Wait for the file storage transfer to complete.
  let isPrivateFilesTransferComplete = false;
  while (!isPrivateFilesTransferComplete) {
    isPrivateFilesTransferComplete =
      await sourceRegionActivities.isFileStorageTransferComplete({
        jobName: privateFilesJobName,
      });

    if (!isPrivateFilesTransferComplete) {
      // Sleep for 1 minute before checking again.
      await sleep("1m");
    }
  }
}

/**
 * Connectors relocation workflows.
 */

const getConnectorsSourceRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof connectorsSourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

const getConnectorsDestinationRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof connectorsDestinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

export async function workspaceRelocateConnectorsWorkflow({
  sourceRegion,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceRegionActivities =
    getConnectorsSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getConnectorsDestinationRegionActivities(destRegion);

  // 1) List all connectors in the workspace.
  const { connectors, dataPath } =
    await sourceRegionActivities.getAllConnectorsForWorkspace({
      workspaceId,
    });

  // 2) Relocate connectors entries to the destination region.
  await destinationRegionActivities.processConnectorsTableChunk({
    dataPath,
    destRegion,
    sourceRegion,
    tableName: "connectors",
    workspaceId,
  });

  // 3) Relocate connectors tables to the destination region for each connector.
  for (const c of connectors) {
    await executeChild(workspaceRelocateConnectorWorkflow, {
      workflowId: `workspaceRelocateConnectorWorkflow-${workspaceId}-${c.id}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          connectorId: c.id,
          destRegion,
          sourceRegion,
          workspaceId,
        },
      ],
      memo,
    });
  }
}

export async function workspaceRelocateConnectorWorkflow({
  connectorId,
  sourceRegion,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase & { connectorId: ModelId }) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceRegionActivities =
    getConnectorsSourceRegionActivities(sourceRegion);

  const tablesOrder =
    await sourceRegionActivities.getTablesWithConnectorIdOrder();

  for (const tableName of tablesOrder) {
    await executeChild(workspaceRelocateConnectorsTableWorkflow, {
      workflowId: `workspaceRelocateConnectorsTableWorkflow-${workspaceId}-${tableName}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          connectorId,
          destRegion,
          sourceRegion,
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
  sourceRegion,
  tableName,
  destRegion,
  workspaceId,
}: RelocationWorkflowBase & {
  connectorId: ModelId;
  tableName: string;
  lastProcessedId?: ModelId;
}) {
  const sourceRegionActivities =
    getConnectorsSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getConnectorsDestinationRegionActivities(destRegion);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateConnectorsTableWorkflow>({
        connectorId,
        sourceRegion,
        destRegion,
        workspaceId,
        tableName,
        lastProcessedId: currentId,
      });
    }

    const { dataPath, hasMore, lastId } =
      await sourceRegionActivities.readConnectorsTableChunk({
        connectorId,
        lastId: currentId,
        limit: CHUNK_SIZE,
        workspaceId,
        tableName,
        sourceRegion,
        destRegion,
      });

    hasMoreRows = hasMore;
    currentId = lastId;

    // If there are no more rows, we can skip the rest of the table.
    if (!dataPath) {
      continue;
    }

    await destinationRegionActivities.processConnectorsTableChunk({
      connectorId,
      dataPath,
      destRegion,
      sourceRegion,
      tableName,
      workspaceId,
    });
  } while (hasMoreRows);
}

/**
 * Core relocation workflows.
 */

const getCoreSourceRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof coreSourceActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

const getCoreDestinationRegionActivities = (region: RegionType) => {
  return proxyActivities<typeof coreDestinationActivities>({
    startToCloseTimeout: "10 minutes",
    taskQueue: RELOCATION_QUEUES_PER_REGION[region],
  });
};

export async function workspaceRelocateCoreWorkflow({
  destRegion,
  lastProcessedId,
  sourceRegion,
  workspaceId,
}: RelocationWorkflowBase & { lastProcessedId?: ModelId }) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateCoreWorkflow>({
        destRegion,
        lastProcessedId: currentId,
        sourceRegion,
        workspaceId,
      });
    }

    const { dataSourceCoreIds, hasMore, lastId } =
      await sourceRegionActivities.retrieveDataSourceCoreIdsBatch({
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
              destRegion,
              sourceRegion,
              workspaceId,
            },
          ],
          memo,
        }),
      { concurrency: TEMPORAL_CORE_DATA_SOURCE_RELOCATION_CONCURRENCY }
    );
  } while (hasMoreRows);
}

// TODO: Below is not idempotent, we need to handle the case where the data source is already created in the destination region.
export async function workspaceRelocateDataSourceCoreWorkflow({
  dataSourceCoreIds,
  destRegion,
  sourceRegion,
  workspaceId,
}: RelocationWorkflowBase & { dataSourceCoreIds: DataSourceCoreIds }) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getCoreDestinationRegionActivities(destRegion);

  // 1) Get the data source from the source region.
  const sourceRegionCoreDataSource =
    await sourceRegionActivities.getCoreDataSource({
      dataSourceCoreIds,
      workspaceId,
    });

  // 2) Create the project and data source in the destination region.
  const destIds = await destinationRegionActivities.createDataSourceProject({
    destRegion,
    sourceRegionCoreDataSource,
    workspaceId,
  });

  // 3) Update the data source in the destination region with the new core ids.
  await destinationRegionActivities.updateDataSourceCoreIds({
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
        destRegion,
        pageCursor: null,
        sourceRegion,
        workspaceId,
      },
    ],
    memo,
  });
}

export async function workspaceRelocateCoreDataSourceResourcesWorkflow({
  dataSourceCoreIds,
  destIds,
  destRegion,
  pageCursor,
  sourceRegion,
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
      workflowId: `workspaceRelocateDataSourceDocumentsWorkflow`,
    },
    {
      fn: workspaceRelocateDataSourceFoldersWorkflow,
      workflowId: `workspaceRelocateDataSourceFoldersWorkflow`,
    },
    {
      fn: workspaceRelocateDataSourceTablesWorkflow,
      workflowId: `workspaceRelocateDataSourceTablesWorkflow`,
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
            destRegion,
            pageCursor,
            sourceRegion,
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
  destRegion,
  pageCursor: initialPageCursor,
  sourceRegion,
  workspaceId,
}: RelocationWorkflowBase & {
  destIds: CreateDataSourceProjectResult;
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
}) {
  const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getCoreDestinationRegionActivities(destRegion);

  let pageCursor: string | null = initialPageCursor;
  let limit: number | null = null;
  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateDataSourceDocumentsWorkflow>({
        dataSourceCoreIds,
        destIds,
        destRegion,
        pageCursor,
        sourceRegion,
        workspaceId,
      });
    }

    const { dataPath, nextPageCursor, nextLimit } =
      await sourceRegionActivities.getDataSourceDocuments({
        pageCursor,
        dataSourceCoreIds,
        sourceRegion,
        workspaceId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        limit: limit || CORE_API_LIST_NODES_BATCH_SIZE,
      });

    if (dataPath) {
      const sourceRegionDustFacingUrl =
        await sourceRegionActivities.getRegionDustFacingUrl();

      await destinationRegionActivities.processDataSourceDocuments({
        destIds,
        dataPath,
        destRegion,
        sourceRegion,
        sourceRegionDustFacingUrl,
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
  destRegion,
  pageCursor: initialPageCursor,
  sourceRegion,
  workspaceId,
}: RelocationWorkflowBase & {
  destIds: CreateDataSourceProjectResult;
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
}) {
  const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getCoreDestinationRegionActivities(destRegion);

  let pageCursor: string | null = initialPageCursor;

  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateDataSourceFoldersWorkflow>({
        dataSourceCoreIds,
        destIds,
        destRegion,
        pageCursor,
        sourceRegion,
        workspaceId,
      });
    }

    const { dataPath, nextPageCursor } =
      await sourceRegionActivities.getDataSourceFolders({
        pageCursor,
        dataSourceCoreIds,
        sourceRegion,
        workspaceId,
      });

    const sourceRegionDustFacingUrl =
      await sourceRegionActivities.getRegionDustFacingUrl();

    await destinationRegionActivities.processDataSourceFolders({
      destIds,
      dataPath,
      destRegion,
      sourceRegion,
      sourceRegionDustFacingUrl,
      workspaceId,
    });

    pageCursor = nextPageCursor;
  } while (pageCursor);
}

export async function workspaceRelocateDataSourceTablesWorkflow({
  dataSourceCoreIds,
  destIds,
  destRegion,
  pageCursor: initialPageCursor,
  sourceRegion,
  workspaceId,
}: RelocationWorkflowBase & {
  destIds: CreateDataSourceProjectResult;
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
}) {
  const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getCoreDestinationRegionActivities(destRegion);

  let pageCursor: string | null = initialPageCursor;
  let limit: number | null = null;
  do {
    if (workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH) {
      await continueAsNew<typeof workspaceRelocateDataSourceTablesWorkflow>({
        dataSourceCoreIds,
        destIds,
        destRegion,
        pageCursor,
        sourceRegion,
        workspaceId,
      });
    }

    const { dataPath, nextPageCursor, nextLimit } =
      await sourceRegionActivities.getDataSourceTables({
        pageCursor,
        dataSourceCoreIds,
        sourceRegion,
        workspaceId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        limit: limit || CORE_API_LIST_TABLES_BATCH_SIZE,
      });
    if (dataPath) {
      const sourceRegionDustFacingUrl =
        await sourceRegionActivities.getRegionDustFacingUrl();

      await destinationRegionActivities.processDataSourceTables({
        destIds,
        dataPath,
        destRegion,
        sourceRegion,
        sourceRegionDustFacingUrl,
        workspaceId,
      });
    }

    pageCursor = nextPageCursor;
    limit = nextLimit;
  } while (pageCursor);
}

export async function workspaceRelocateAppsWorkflow({
  workspaceId,
  lastProcessedId,
  sourceRegion,
  destRegion,
}: RelocationWorkflowBase & { lastProcessedId?: ModelId }) {
  const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getCoreDestinationRegionActivities(destRegion);

  let hasMoreRows = true;
  let currentId: ModelId | undefined = lastProcessedId;

  do {
    const { dustAPIProjectIds, hasMore, lastId } =
      await sourceRegionActivities.retrieveAppsCoreIdsBatch({
        lastId: currentId,
        workspaceId,
      });

    hasMoreRows = hasMore;
    currentId = lastId;

    for (const dustAPIProjectId of dustAPIProjectIds) {
      const { dataPath } = await sourceRegionActivities.getApp({
        dustAPIProjectId,
        workspaceId,
        sourceRegion,
      });

      await destinationRegionActivities.processApp({
        dustAPIProjectId,
        dataPath,
        destRegion,
        sourceRegion,
        workspaceId,
      });
    }
  } while (hasMoreRows);
}

export async function workspaceRelocateAppWorkflow({
  workspaceId,
  sourceRegion,
  destRegion,
  dustAPIProjectId,
}: RelocationWorkflowBase & { dustAPIProjectId: string }) {
  const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);
  const destinationRegionActivities =
    getCoreDestinationRegionActivities(destRegion);

  const { dataPath } = await sourceRegionActivities.getApp({
    dustAPIProjectId,
    workspaceId,
    sourceRegion,
  });

  await destinationRegionActivities.processApp({
    dustAPIProjectId,
    dataPath,
    destRegion,
    sourceRegion,
    workspaceId,
  });
}
