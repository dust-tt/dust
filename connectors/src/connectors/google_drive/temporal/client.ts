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
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { googleDriveIncrementalSyncWorkflowId } from "@connectors/types";

import {
  googleDriveFixParentsConsistencyWorkflow,
  googleDriveFixParentsConsistencyWorkflowId,
  googleDriveFullSync,
  googleDriveFullSyncWorkflowId,
  googleDriveGarbageCollectorWorkflow,
  googleDriveGarbageCollectorWorkflowId,
  googleDriveIncrementalSync,
} from "./workflows";
const logger = mainLogger.child({ provider: "google" });

export async function launchGoogleDriveFullSyncWorkflow(
  connectorId: ModelId,
  fromTs: number | null,
  addedFolderIds: string[],
  mimeTypeFilter?: string[]
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  if (fromTs) {
    return new Err(
      new Error("Google Drive connector does not support partial resync")
    );
  }

  const client = await getTemporalClient();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const signalArgs: FolderUpdatesSignal[] =
    addedFolderIds.map((sId) => ({
      action: "added",
      folderId: sId,
    })) ?? [];

  const workflowId = googleDriveFullSyncWorkflowId(connectorId);
  try {
    await client.workflow.signalWithStart(googleDriveFullSync, {
      args: [
        {
          connectorId: connectorId,
          garbageCollect: true,
          startSyncTs: undefined,
          foldersToBrowse: addedFolderIds,
          totalCount: 0,
          mimeTypeFilter: mimeTypeFilter,
        },
      ],
      taskQueue: GDRIVE_FULL_SYNC_QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
      signal: folderUpdatesSignal,
      signalArgs: [signalArgs],
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}

export async function launchGoogleDriveIncrementalSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();

  const workflowId = googleDriveIncrementalSyncWorkflowId(connectorId);

  // Randomize the delay to avoid all incremental syncs starting at the same time, especially when restarting all via cli.
  const delay = Math.floor(Math.random() * 5);

  try {
    await terminateWorkflow(workflowId);
    await client.workflow.start(googleDriveIncrementalSync, {
      args: [connectorId],
      taskQueue: GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
      startDelay: `${delay} minutes`,
    });
    logger.info(
      {
        workspaceId: connector.workspaceId,
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: connector.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}

export async function launchGoogleGarbageCollector(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();
  const workflowId = googleDriveGarbageCollectorWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<typeof googleDriveGarbageCollectorWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
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
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
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

  const client = await getTemporalClient();
  const workflowId = googleDriveFixParentsConsistencyWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<
      typeof googleDriveFixParentsConsistencyWorkflow
    > = client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
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
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}
