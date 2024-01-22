import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/intercom/temporal/config";
import { intercomHelpCentersSyncWorkflow } from "@connectors/connectors/intercom/temporal/workflows";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

function getIntercomHelpCentersSyncWorkflowId(connectorId: ModelId) {
  return `intercom-sync-help-centers-${connectorId}`;
}

export async function launchIntercomHelpCentersSyncWorkflow(
  connectorId: string
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const connectorIdAsNumber = parseInt(connectorId, 10);
  const workflowId = getIntercomHelpCentersSyncWorkflowId(connectorIdAsNumber);

  try {
    const handle: WorkflowHandle<typeof intercomHelpCentersSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    await client.workflow.start(intercomHelpCentersSyncWorkflow, {
      args: [{ connectorId: connectorIdAsNumber }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      cronSchedule: "0 * * * *", // every hour
      memo: {
        connectorId: connectorId,
      },
    });
    logger.info(
      { workspaceId: connector.workspaceId, workflowId },
      "[Intercom] Started workflow launchIntercomFullSyncWorkflow."
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      { workspaceId: connector.workspaceId, error: e },
      "[Intercom] Failed to start workflow launchIntercomFullSyncWorkflow."
    );
    return new Err(e as Error);
  }
}

export async function stopIntercomHelpCentersSyncWorkflow(
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
  const workflowId = getIntercomHelpCentersSyncWorkflowId(connectorIdAsNumber);

  try {
    const handle: WorkflowHandle<typeof intercomHelpCentersSyncWorkflow> =
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
