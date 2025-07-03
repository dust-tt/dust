import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/salesforce/temporal/config";
import {
  makeSalesforceSyncQueryWorkflowId,
  salesforceSyncQueryWorkflow,
} from "@connectors/connectors/salesforce/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

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

export async function stopSalesforceSyncQueryWorkflow(
  connectorId: ModelId,
  queryId: ModelId
): Promise<Result<void, Error>> {
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
      "Failed to stop Salesforce workflow."
    );
    return new Err(normalizeError(e));
  }
}
