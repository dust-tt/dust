import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/bigquery/temporal/config";
import { resyncSignal } from "@connectors/connectors/bigquery/temporal/signals";
import { bigquerySyncWorkflow } from "@connectors/connectors/bigquery/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

function makeBigQuerySyncWorkflowId(connectorId: ModelId): string {
  return `bigquery-sync-${connectorId}`;
}

export async function launchBigQuerySyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[BigQuery] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const client = await getTemporalClient();
  const workflowId = makeBigQuerySyncWorkflowId(connectorId);

  try {
    await client.workflow.signalWithStart(bigquerySyncWorkflow, {
      args: [
        {
          connectorId: connector.id,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: resyncSignal,
      // If we don't pass signalArgs the workflow will not be signaled.
      signalArgs: [],
      memo: {
        connectorId,
      },
      // Every hour.
      cronSchedule: `${connector.id % 60} * * * *`,
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopBigQuerySyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[BigQuery] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeBigQuerySyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof bigquerySyncWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed to stop BigQuery workflow."
    );
    return new Err(e as Error);
  }
}
