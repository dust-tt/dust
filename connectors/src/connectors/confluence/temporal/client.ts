import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/confluence/temporal/config";
import { makeConfluenceFullSyncWorkflowId } from "@connectors/connectors/confluence/temporal/utils";
import { confluenceFullSyncWorkflow } from "@connectors/connectors/confluence/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

async function isConfluenceFullSyncAlreadyRunning(connector: Connector) {
  const client = await getTemporalClient();

  const handle: WorkflowHandle<typeof confluenceFullSyncWorkflow> =
    client.workflow.getHandle(makeConfluenceFullSyncWorkflowId(connector.id));

  try {
    const executionDescription = await handle.describe();

    return executionDescription.status.name === "RUNNING";
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      return false;
    }
    throw err;
  }
}

export async function launchConfluenceFullSyncWorkflow(
  connectorId: ModelId,
  fromTs: number | null
): Promise<Result<undefined, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  if (fromTs) {
    throw new Error(`Partial full resync not available yet for Confluence.`);
  }

  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const isFullSyncAlreadyRunning = await isConfluenceFullSyncAlreadyRunning(
    connector
  );
  if (isFullSyncAlreadyRunning) {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "launchConfluenceFullSyncWorkflow: Confluence full sync workflow already running."
    );

    return new Err(
      new Error("Confluence full sync workflow is already running")
    );
  }

  await client.workflow.start(confluenceFullSyncWorkflow, {
    args: [
      {
        connectorId: connector.id,
        dataSourceConfig,
        connectionId: connector.connectionId,
      },
    ],
    taskQueue: QUEUE_NAME,
    workflowId: makeConfluenceFullSyncWorkflowId(connector.id),
    searchAttributes: {
      connectorId: [connectorId],
    },
    memo: {
      connectorId,
    },
  });

  return new Ok(undefined);
}
