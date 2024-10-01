import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/snowflake/temporal/config";
import { resyncSignal } from "@connectors/connectors/snowflake/temporal/signals";
import { snowflakeSyncWorkflow } from "@connectors/connectors/snowflake/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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

  try {
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
      // Every 10 minutes.
      cronSchedule: "*/10 * * * *",
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopSnowflakeSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Confluence] Connector not found. ConnectorId: ${connectorId}`
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
      "Failed to stop Confluence workflow."
    );
    return new Err(e as Error);
  }
}
