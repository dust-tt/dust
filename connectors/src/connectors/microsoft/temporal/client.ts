import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/common";

import { getRootNodesToSync } from "@connectors/connectors/microsoft/temporal/activities";
import { QUEUE_NAME } from "@connectors/connectors/microsoft/temporal/config";
import type { FolderUpdatesSignal } from "@connectors/connectors/microsoft/temporal/signal";
import { folderUpdatesSignal } from "@connectors/connectors/microsoft/temporal/signal";
import {
  fullSyncWorkflow,
  incrementalSyncWorkflowV2,
  microsoftFullSyncWorkflowId,
  microsoftGarbageCollectionWorkflow,
  microsoftIncrementalSyncWorkflowId,
} from "@connectors/connectors/microsoft/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import {
  microsoftGarbageCollectionWorkflowId,
  normalizeError,
} from "@connectors/types";

export async function launchMicrosoftFullSyncWorkflow(
  connectorId: ModelId,
  nodeIdsToSync?: string[],
  nodeIdsToDelete?: string[]
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflowId = microsoftFullSyncWorkflowId(connectorId);

  if (!nodeIdsToSync) {
    nodeIdsToSync = await getRootNodesToSync(connectorId);
  }

  if (!nodeIdsToDelete) {
    nodeIdsToDelete = [];
  }

  const signalArgs: FolderUpdatesSignal[] = [
    ...nodeIdsToSync.map((sId) => ({
      action: "added" as const,
      folderId: sId,
    })),
    ...nodeIdsToDelete.map((sId) => ({
      action: "removed" as const,
      folderId: sId,
    })),
  ];

  try {
    await client.workflow.signalWithStart(fullSyncWorkflow, {
      args: [{ connectorId }],
      taskQueue: QUEUE_NAME,
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
    return new Err(normalizeError(e));
  }
}

export async function launchMicrosoftIncrementalSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflowId = microsoftIncrementalSyncWorkflowId(connectorId);

  try {
    await terminateWorkflow(workflowId);
    await client.workflow.start(incrementalSyncWorkflowV2, {
      args: [{ connectorId }],
      taskQueue: QUEUE_NAME,
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
    return new Err(normalizeError(e));
  }
}

export async function launchMicrosoftGarbageCollectionWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflowId = microsoftGarbageCollectionWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof microsoftGarbageCollectionWorkflow> =
      client.workflow.getHandle(workflowId);

    // if the workflow is running, do nothing
    try {
      const description = await handle.describe();

      if (description.status.name === "RUNNING") {
        logger.info(
          {
            workspaceId: dataSourceConfig.workspaceId,
            workflowId,
          },
          `Microsoft GC Workflow is already running, not relaunching.`
        );
        return new Ok(workflowId);
      }
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }

    await client.workflow.start(microsoftGarbageCollectionWorkflow, {
      args: [{ connectorId }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      // every day
      cronSchedule: "0 0 * * *",
      memo: {
        connectorId: connectorId,
      },
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
    return new Err(normalizeError(e));
  }
}
