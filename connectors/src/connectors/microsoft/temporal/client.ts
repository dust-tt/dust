import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { QUEUE_NAME } from "@connectors/connectors/microsoft/temporal/config";
import {
  fullSyncWorkflow,
  microsoftFullSyncWorkflowId,
} from "@connectors/connectors/microsoft/temporal/workflow";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getTemporalClient, terminateWorkflow } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function launchMicrosoftFullSyncWorkflow(
  connectorId: ModelId,
  fromTs: number | null
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  if (fromTs) {
    return new Err(
      new Error("Google Drive connector does not support partial resync")
    );
  }

  const client = await getTemporalClient();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflowId = microsoftFullSyncWorkflowId(connectorId);

  try {
    await terminateWorkflow(workflowId);
    await client.workflow.start(fullSyncWorkflow, {
      args: [{ connectorId, dataSourceConfig }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
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
