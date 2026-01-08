import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  GDRIVE_FULL_SYNC_QUEUE_NAME,
  GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME,
} from "@connectors/connectors/google_drive/temporal/config";
import type { FolderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import { folderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { GoogleDriveConfigModel } from "@connectors/lib/models/google_drive";
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import {
  googleDriveIncrementalSyncWorkflowId,
  normalizeError,
} from "@connectors/types";

import {
  googleDriveFixParentsConsistencyWorkflow,
  googleDriveFixParentsConsistencyWorkflowId,
  googleDriveFullSync,
  googleDriveFullSyncV2,
  googleDriveFullSyncV2WorkflowId,
  googleDriveFullSyncWorkflowId,
  googleDriveGarbageCollectorWorkflow,
  googleDriveGarbageCollectorWorkflowId,
  googleDriveIncrementalSync,
  googleDriveIncrementalSyncV2,
  googleDriveIncrementalSyncV2WorkflowId,
} from "./workflows";

const isWorkflowRunning = async (handle: WorkflowHandle): Promise<boolean> => {
  try {
    const description = await handle.describe();
    // Workflow is running if it's in one of these states
    return description.status.name === "RUNNING";
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      throw e;
    }

    return false;
  }
};

export async function launchGoogleDriveFullSyncWorkflow(
  connectorId: ModelId,
  fromTs: number | null,
  addedFolderIds: string[],
  removedFolderIds: string[] = [],
  mimeTypeFilter?: string[]
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const localLogger = getActivityLogger(connector);

  if (fromTs) {
    return new Err(
      new Error("Google Drive connector does not support partial resync")
    );
  }

  // Check feature flag to determine which workflow version to use
  const config = await GoogleDriveConfigModel.findOne({
    where: { connectorId },
  });
  const useParallelSync = config?.useParallelSync ?? false;

  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  // Create signals for both added and removed folders
  const signalArgs: FolderUpdatesSignal[] = [
    ...addedFolderIds.map((sId) => ({
      action: "added" as const,
      folderId: sId,
    })),
    ...removedFolderIds.map((sId) => ({
      action: "removed" as const,
      folderId: sId,
    })),
  ];

  // Route to appropriate workflow based on feature flag
  const workflowId = useParallelSync
    ? googleDriveFullSyncV2WorkflowId(connectorId)
    : googleDriveFullSyncWorkflowId(connectorId);

  try {
    const handle = client.workflow.getHandle(workflowId);
    const workflowRunning = await isWorkflowRunning(handle);

    if (workflowRunning) {
      await handle.signal(folderUpdatesSignal, signalArgs);
      localLogger.info(
        {
          workspaceId: dataSourceConfig.workspaceId,
          workflowId,
          useParallelSync,
          foldersAdded: addedFolderIds.length,
          foldersRemoved: removedFolderIds.length,
        },
        `Sent signal to running workflow.`
      );
    } else {
      if (addedFolderIds.length > 0) {
        if (useParallelSync) {
          await client.workflow.start(googleDriveFullSyncV2, {
            args: [
              {
                connectorId,
                garbageCollect: true,
                startSyncTs: undefined,
                mimeTypeFilter,
                runningFolderWorkflows: {},
                folderWorkflowCounters: {},
                initialFolderIds: addedFolderIds,
              },
            ],
            taskQueue: GDRIVE_FULL_SYNC_QUEUE_NAME,
            workflowId,
            searchAttributes: {
              connectorId: [connectorId],
            },
            memo: {
              connectorId,
            },
          });
        } else {
          await client.workflow.start(googleDriveFullSync, {
            args: [
              {
                connectorId,
                garbageCollect: true,
                startSyncTs: undefined,
                foldersToBrowse: addedFolderIds,
                totalCount: 0,
                mimeTypeFilter,
              },
            ],
            taskQueue: GDRIVE_FULL_SYNC_QUEUE_NAME,
            workflowId,
            searchAttributes: {
              connectorId: [connectorId],
            },
            memo: {
              connectorId,
            },
          });
        }
        localLogger.info(
          {
            workspaceId: dataSourceConfig.workspaceId,
            workflowId,
            useParallelSync,
          },
          `Started workflow.`
        );
      } else if (removedFolderIds.length > 0) {
        // Only removals, launch garbage collector
        localLogger.info(
          {
            workspaceId: dataSourceConfig.workspaceId,
            foldersRemoved: removedFolderIds.length,
          },
          `Folders removed but workflow not running, will launch GC.`
        );
        return await launchGoogleGarbageCollector(connectorId);
      }
    }
    return new Ok(workflowId);
  } catch (e) {
    localLogger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(normalizeError(e));
  }
}

export async function launchGoogleDriveIncrementalSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const localLogger = getActivityLogger(connector);

  // Check feature flag to determine which workflow version to use
  const config = await GoogleDriveConfigModel.findOne({
    where: { connectorId },
  });
  const useParallelSync = config?.useParallelSync ?? false;

  const client = await getTemporalClient();

  // Route to appropriate workflow based on feature flag
  const workflowId = useParallelSync
    ? googleDriveIncrementalSyncV2WorkflowId(connectorId)
    : googleDriveIncrementalSyncWorkflowId(connectorId);

  const workflowFn = useParallelSync
    ? googleDriveIncrementalSyncV2
    : googleDriveIncrementalSync;

  // Randomize the delay to avoid all incremental syncs starting at the same time, especially when restarting all via cli.
  const delay = Math.floor(Math.random() * 5);

  try {
    // Terminate both versions of the workflows in case we changed the flag
    await terminateWorkflow(
      googleDriveIncrementalSyncV2WorkflowId(connectorId)
    );
    await terminateWorkflow(googleDriveIncrementalSyncWorkflowId(connectorId));

    await client.workflow.start(workflowFn, {
      args: [connectorId],
      taskQueue: GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId,
      },
      startDelay: `${delay} minutes`,
    });
    localLogger.info(
      {
        workspaceId: connector.workspaceId,
        workflowId,
        useParallelSync,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    localLogger.error(
      {
        workspaceId: connector.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(normalizeError(e));
  }
}

/**
 * Signal folder removal to a running workflow, or launch GC if workflow is not running.
 * This function is used when folders are removed without any additions.
 */
export async function signalFolderRemoval(
  connectorId: ModelId,
  removedFolderIds: string[]
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const localLogger = getActivityLogger(connector);

  const config = await GoogleDriveConfigModel.findOne({
    where: { connectorId },
  });
  const useParallelSync = config?.useParallelSync ?? false;

  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflowId = useParallelSync
    ? googleDriveFullSyncV2WorkflowId(connectorId)
    : googleDriveFullSyncWorkflowId(connectorId);

  const signalArgs: FolderUpdatesSignal[] = removedFolderIds.map((sId) => ({
    action: "removed" as const,
    folderId: sId,
  }));

  try {
    // Try to get handle to existing workflow
    const handle = client.workflow.getHandle(workflowId);
    const workflowRunning = await isWorkflowRunning(handle);

    if (workflowRunning) {
      // Workflow is running, send signal to stop tracking these folders
      await handle.signal(folderUpdatesSignal, signalArgs);
      localLogger.info(
        {
          workspaceId: dataSourceConfig.workspaceId,
          workflowId,
          useParallelSync,
          foldersRemoved: removedFolderIds.length,
        },
        `Sent removal signal to running workflow.`
      );
      return new Ok(workflowId);
    } else {
      // Workflow not running, just launch GC to clean up removed folders
      localLogger.info(
        {
          workspaceId: dataSourceConfig.workspaceId,
          foldersRemoved: removedFolderIds.length,
        },
        `Workflow not running, launching GC for removed folders.`
      );
      return await launchGoogleGarbageCollector(connectorId);
    }
  } catch (e) {
    localLogger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed to signal folder removal.`
    );
    return new Err(normalizeError(e));
  }
}

export async function launchGoogleGarbageCollector(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const localLogger = getActivityLogger(connector);
  const client = await getTemporalClient();
  const workflowId = googleDriveGarbageCollectorWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<typeof googleDriveGarbageCollectorWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate("Terminating before restarting workflow");
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    await client.workflow.start(googleDriveGarbageCollectorWorkflow, {
      args: [connector.id, new Date().getTime()],
      taskQueue: GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
    });
    localLogger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    localLogger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(normalizeError(e));
  }
}

export async function launchGoogleFixParentsConsistencyWorkflow(
  connectorId: ModelId,
  execute: boolean
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const localLogger = getActivityLogger(connector);

  const client = await getTemporalClient();
  const workflowId = googleDriveFixParentsConsistencyWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<
      typeof googleDriveFixParentsConsistencyWorkflow
    > = client.workflow.getHandle(workflowId);
    try {
      await handle.terminate("Terminating before restarting workflow");
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    await client.workflow.start(googleDriveFixParentsConsistencyWorkflow, {
      args: [connector.id, execute],
      taskQueue: GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
    });
    localLogger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    localLogger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(normalizeError(e));
  }
}
