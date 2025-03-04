import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import {
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { gongSyncWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import { QUEUE_NAME } from "@connectors/connectors/salesforce/temporal/config";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

function makeGongSyncWorkflowId(connector: ConnectorResource): string {
  return `gong-sync-${connector.id}`;
}

export async function launchGongSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`[Gong] Connector not found. ConnectorId: ${connectorId}`);
  }

  const client = await getTemporalClient();
  const workflowId = makeGongSyncWorkflowId(connector);

  try {
    await client.workflow.signalWithStart(gongSyncWorkflow, {
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
      signalArgs: [],
      memo: {
        connectorId,
      },
      // TODO(2025-03-04) - Validate this.
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        intervals: [{ every: "1h" }],
      },
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopGongSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Salesforce] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeGongSyncWorkflowId(connector);

  try {
    const handle: WorkflowHandle<typeof gongSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    return new Ok(undefined);
  } catch (error) {
    logger.error({ workflowId, error }, "Failed to stop Gong workflow.");
    return new Err(e as Error);
  }
}
