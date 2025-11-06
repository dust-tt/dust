import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/databricks/temporal/config";
import { resyncSignal } from "@connectors/connectors/databricks/temporal/signals";
import { databricksSyncWorkflow } from "@connectors/connectors/databricks/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

function makeDatabricksWorkflowId(connectorId: ModelId): string {
  return `databricks-sync-${connectorId}`;
}

export async function launchDatabricksSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Databricks] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const client = await getTemporalClient();
  const workflowId = makeDatabricksWorkflowId(connectorId);

  const numericId = Number(connector.id);

  const workflowAlreadyRunning = await (async () => {
    try {
      const handle: WorkflowHandle<typeof databricksSyncWorkflow> =
        client.workflow.getHandle(workflowId);
      const description = await handle.describe();
      return description.status.name === "RUNNING";
    } catch (err) {
      return false;
    }
  })();

  const signalWithStart = async () =>
    client.workflow.signalWithStart(databricksSyncWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: resyncSignal,
      signalArgs: [],
      memo: {
        connectorId,
      },
      cronSchedule: `${numericId % 60} ${numericId % 24},${
        (numericId + 8) % 24
      },${(numericId + 16) % 24} * * *`,
    });

  try {
    await signalWithStart();

    if (!workflowAlreadyRunning) {
      await signalWithStart();
    }

    return new Ok(workflowId);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function stopDatabricksSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Databricks] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeDatabricksWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof databricksSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) {
        throw error;
      }
    }
    return new Ok(undefined);
  } catch (error) {
    logger.error(
      {
        workflowId,
        error,
      },
      "Failed to stop Databricks workflow."
    );
    return new Err(normalizeError(error));
  }
}

