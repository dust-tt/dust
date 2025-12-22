import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/snowflake/temporal/config";
import { resyncSignal } from "@connectors/connectors/snowflake/temporal/signals";
import { snowflakeSyncWorkflow } from "@connectors/connectors/snowflake/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

function makeSnowflakeSyncWorkflowId(connectorId: ModelId): string {
  return `snowflake-sync-${connectorId}`;
}

export async function launchSnowflakeSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Snowflake] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const client = await getTemporalClient();
  const workflowId = makeSnowflakeSyncWorkflowId(connectorId);

  // hourOffset ensures jobs are distributed across the day based on connector ID
  const hourOffset = connector.id % 6;

  const workflowAlreadyRunning = await (async () => {
    try {
      const wfHandle: WorkflowHandle<typeof snowflakeSyncWorkflow> =
        client.workflow.getHandle(workflowId);
      const description = await wfHandle.describe();
      return description.status.name === "RUNNING";
    } catch (_err) {
      return false;
    }
  })();

  const signaWithStart = async () => {
    await client.workflow.signalWithStart(snowflakeSyncWorkflow, {
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
      // Every 6 hours, with hour offset based on connector ID
      cronSchedule: `${connector.id % 60} ${hourOffset},${(hourOffset + 6) % 24},${(hourOffset + 12) % 24},${(hourOffset + 18) % 24} * * *`,
    });
  };

  try {
    await signaWithStart();

    if (!workflowAlreadyRunning) {
      // We signal the workflow again, so we skip the timer.
      await signaWithStart();
    }

    return new Ok(workflowId);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function stopSnowflakeSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Snowflake] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeSnowflakeSyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof snowflakeSyncWorkflow> =
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
      "Failed to stop Snowflake workflow."
    );
    return new Err(normalizeError(e));
  }
}
