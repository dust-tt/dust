import {
  GDRIVE_FULL_SYNC_QUEUE_NAME,
  GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME,
} from "@connectors/connectors/google_drive/temporal/config";
import type { FolderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import { folderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import {
  googleDriveIncrementalSyncWorkflowId,
  normalizeError,
} from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  googleDriveFixParentsConsistencyWorkflow,
  googleDriveFixParentsConsistencyWorkflowId,
  googleDriveFullSyncV2,
  googleDriveFullSyncWorkflowId,
  googleDriveGarbageCollectorWorkflow,
  googleDriveGarbageCollectorWorkflowId,
  googleDriveIncrementalSyncV2,
} from "./workflows";

/**
 * Launch a Google Drive full sync workflow.
 * @param addedFolderIds - Pass `null` to sync all folders from DB, or specific folder IDs to sync only those.
 */
export async function launchGoogleDriveFullSyncWorkflow(
  connectorId: ModelId,
  fromTs: number | null,
  addedFolderIds: string[] | null = null,
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

  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  // Create signals for both added and removed folders (only if specific folders provided)
  const signalArgs: FolderUpdatesSignal[] = [
    ...(addedFolderIds || []).map((sId) => ({
      action: "added" as const,
      folderId: sId,
    })),
    ...removedFolderIds.map((sId) => ({
      action: "removed" as const,
      folderId: sId,
    })),
  ];

  const workflowId = googleDriveFullSyncWorkflowId(connectorId);
  try {
    if (addedFolderIds === null) {
      // Full resync (null): terminate any running workflow and start fresh
      await terminateWorkflow(workflowId);
      await client.workflow.start(googleDriveFullSyncV2, {
        args: [
          {
            connectorId,
            garbageCollect: true,
            startSyncTs: undefined,
            foldersToBrowse: null,
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
      localLogger.info(
        {
          workspaceId: dataSourceConfig.workspaceId,
          workflowId,
        },
        `Terminated existing workflow and started fresh full sync.`
      );
      return new Ok(workflowId);
    } else {
      // Specific folders: use signalWithStart to either signal running workflow or start new one.
      // If workflow is running, it just signals. If not, it starts with foldersToBrowse and signals.
      // This handles the removal-only case gracefully: starts with empty folders, skips sync, runs GC.
      await client.workflow.signalWithStart(googleDriveFullSyncV2, {
        args: [
          {
            connectorId,
            garbageCollect: true,
            startSyncTs: undefined,
            foldersToBrowse: addedFolderIds,
            mimeTypeFilter,
          },
        ],
        taskQueue: GDRIVE_FULL_SYNC_QUEUE_NAME,
        workflowId,
        signal: folderUpdatesSignal,
        signalArgs: [signalArgs],
        searchAttributes: {
          connectorId: [connectorId],
        },
        memo: {
          connectorId,
        },
      });

      localLogger.info(
        {
          workspaceId: dataSourceConfig.workspaceId,
          workflowId,
          foldersAdded: addedFolderIds.length,
          foldersRemoved: removedFolderIds.length,
        },
        `Sent signalWithStart to workflow.`
      );

      return new Ok(workflowId);
    }
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

  const client = await getTemporalClient();

  const workflowId = googleDriveIncrementalSyncWorkflowId(connectorId);

  // Randomize the delay to avoid all incremental syncs starting at the same time, especially when restarting all via cli.
  const delayMinutes = Math.floor(Math.random() * 5);

  try {
    await terminateWorkflow(workflowId);

    await client.workflow.start(googleDriveIncrementalSyncV2, {
      args: [connectorId],
      taskQueue: GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId,
      },
      startDelay: `${delayMinutes} minutes`,
    });
    localLogger.info(
      {
        workspaceId: connector.workspaceId,
        workflowId,
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
