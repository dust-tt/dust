import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/intercom/temporal/config";
import type { IntercomUpdateSignal } from "@connectors/connectors/intercom/temporal/signals";
import { intercomUpdatesSignal } from "@connectors/connectors/intercom/temporal/signals";
import { intercomSyncWorkflow } from "@connectors/connectors/intercom/temporal/workflows";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

function getIntercomSyncWorkflowId(connectorId: ModelId) {
  return `intercom-sync-${connectorId}`;
}

export async function launchIntercomSyncWorkflow(
  connectorId: ModelId,
  helpCenterIds: string[] = []
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = getIntercomSyncWorkflowId(connectorId);
  const signaledHelpCenterIds: IntercomUpdateSignal[] = helpCenterIds.map(
    (helpCenterId) => ({
      type: "help_center",
      intercomId: helpCenterId,
    })
  );

  // When the workflow is inactive, we omit passing helpCenterIds as they are only used to signal modifications within a currently active full sync workflow.
  try {
    await client.workflow.signalWithStart(intercomSyncWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: intercomUpdatesSignal,
      signalArgs: [signaledHelpCenterIds],
      memo: {
        connectorId,
      },
      cronSchedule: "30 * * * *", // Every hour, at 30 of the hour.
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopIntercomSyncWorkflow(
  connectorId: string
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const connectorIdAsNumber = parseInt(connectorId, 10);
  const workflowId = getIntercomSyncWorkflowId(connectorIdAsNumber);

  try {
    const handle: WorkflowHandle<typeof intercomSyncWorkflow> =
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
      "[Intercom] Failed stopping workflow."
    );
    return new Err(e as Error);
  }
}
