import { ModelId } from "@dust-tt/types";
import { WorkflowHandle, WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/intercom/temporal/config";
import { intercomHelpCentersSyncWorkflow } from "@connectors/connectors/intercom/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

function getIntercomHelpCentersSyncWorkflowId(connectorId: ModelId) {
  return `intercom-sync-help-centers-${connectorId}`;
}

export async function launchIntercomHelpCentersSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
  startFromTs?: number | null;
  forceResync?: boolean;
}) {
  // TODO DAPH MANAGE startFromTs & forceResync

  const client = await getTemporalClient();
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const workflowId = getIntercomHelpCentersSyncWorkflowId(connectorId);

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
      args: [{ connectorId, dataSourceConfig }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      cronSchedule: "*/30 * * * *", // Every 30 minutes
      memo: {
        connectorId: connectorId,
      },
    });
    logger.info(
      { workspaceId: dataSourceConfig.workspaceId, workflowId },
      "[Intercom] Started workflow launchIntercomFullSyncWorkflow."
    );
  } catch (e) {
    logger.error(
      { workspaceId: dataSourceConfig.workspaceId, error: e },
      "[Intercom] Failed to start workflow launchIntercomFullSyncWorkflow."
    );
    throw e;
  }
}
