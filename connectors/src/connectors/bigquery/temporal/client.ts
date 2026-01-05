import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/bigquery/temporal/config";
import { resyncSignal } from "@connectors/connectors/bigquery/temporal/signals";
import { bigquerySyncWorkflow } from "@connectors/connectors/bigquery/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

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

  // hourOffset ensures jobs are distributed across the day based on connector ID
  const hourOffset = connector.id % 24;

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
      // Every 24 hours, with hour offset based on connector ID.
      cronSchedule: `${connector.id % 60} ${hourOffset} * * *`,
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }

  return new Ok(workflowId);
}

export async function stopBigQuerySyncWorkflow({
  connectorId,
  stopReason,
}: {
  connectorId: ModelId;
  stopReason: string;
}): Promise<Result<void, Error>> {
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
      await handle.terminate(stopReason);
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
    return new Err(normalizeError(e));
  }
}
