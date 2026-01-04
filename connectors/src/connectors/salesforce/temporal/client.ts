import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/salesforce/temporal/config";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";
import {
  makeSalesforceSyncQueryWorkflowId,
  makeSalesforceSyncWorkflowId,
  salesforceSyncQueryWorkflow,
  salesforceSyncWorkflow,
} from "@connectors/connectors/salesforce/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

export async function launchSalesforceSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Salesforce] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const client = await getTemporalClient();
  const workflowId = makeSalesforceSyncWorkflowId(connectorId);

  // hourOffset ensures jobs are distributed across the day based on connector ID
  const hourOffset = connector.id % 6;

  try {
    await client.workflow.signalWithStart(salesforceSyncWorkflow, {
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
      // Every 6 hours, with hour offset based on connector ID.
      cronSchedule: `${connector.id % 60} ${hourOffset},${(hourOffset + 6) % 24},${(hourOffset + 12) % 24},${(hourOffset + 18) % 24} * * *`,
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }

  return new Ok(workflowId);
}

export async function stopSalesforceSyncWorkflow({
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
      `[Salesforce] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeSalesforceSyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof salesforceSyncWorkflow> =
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
      "Failed to stop Salesforce workflow."
    );
    return new Err(normalizeError(e));
  }
}

export async function launchSalesforceSyncQueryWorkflow(
  connectorId: ModelId,
  queryId: ModelId,
  upToLastModifiedDateTs: number | null
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeSalesforceSyncQueryWorkflowId(
    connectorId,
    queryId,
    upToLastModifiedDateTs
  );

  try {
    await client.workflow.start(salesforceSyncQueryWorkflow, {
      args: [
        {
          connectorId,
          queryId,
          upToLastModifiedDateTs,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId,
      },
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }

  return new Ok(workflowId);
}

export async function stopSalesforceSyncQueryWorkflow({
  connectorId,
  queryId,
  stopReason,
}: {
  connectorId: ModelId;
  queryId: ModelId;
  stopReason: string;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Salesforce] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeSalesforceSyncQueryWorkflowId(
    connectorId,
    queryId,
    null
  );

  try {
    const handle: WorkflowHandle<typeof salesforceSyncQueryWorkflow> =
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
      "Failed to stop Salesforce workflow."
    );
    return new Err(normalizeError(e));
  }
}
