import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { QUEUE_NAME } from "@connectors/connectors/microsoft/temporal/config";
import {
  fullSyncWorkflow,
  incrementalSyncWorkflow,
  microsoftDeletionWorkflow,
  microsoftDeletionWorkflowId,
  microsoftFullSyncWorkflowId,
  microsoftIncrementalSyncWorkflowId,
} from "@connectors/connectors/microsoft/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function launchMicrosoftFullSyncWorkflow(
  connectorId: ModelId,
  nodeIdsToSync?: string[]
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflowId = microsoftFullSyncWorkflowId(connectorId);

  try {
    await terminateWorkflow(workflowId);
    await client.workflow.start(fullSyncWorkflow, {
      args: [{ connectorId, nodeIdsToSync }],
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
    return new Err(e as Error);
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
    await client.workflow.start(incrementalSyncWorkflow, {
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
    return new Err(e as Error);
  }
}

export async function launchMicrosoftDeletionWorkflow(
  connectorId: ModelId,
  nodeIdsToDelete: string[]
): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const workflowId = microsoftDeletionWorkflowId(connectorId, nodeIdsToDelete);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  try {
    await terminateWorkflow(workflowId);

    await client.workflow.start(microsoftDeletionWorkflow, {
      args: [{ connectorId, nodeIdsToDelete }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
    });

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: err,
      },
      `Failed starting workflow.`
    );
    return new Err(err as Error);
  }
}
