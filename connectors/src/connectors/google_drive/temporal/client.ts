import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector, ModelId } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";

import {
  googleDriveFullSync,
  googleDriveFullSyncWorkflowId,
} from "./workflows";
const logger = mainLogger.child({ provider: "google" });

export async function launchGoogleDriveFullSyncWorkflow(
  connectorId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();
  const connectorIdModelId = parseInt(connectorId, 10) as ModelId;

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const nangoConnectionId = connector.connectionId;

  const workflowId = googleDriveFullSyncWorkflowId(connectorIdModelId);
  try {
    await client.workflow.start(googleDriveFullSync, {
      args: [connectorIdModelId, nangoConnectionId, dataSourceConfig],
      taskQueue: "google-queue",
      workflowId: workflowId,
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}
