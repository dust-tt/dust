import { Connector } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

import { workspaceFullSync } from "./workflows";

export async function launchSlackSyncWorkflow(
  connectorId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const dataSourceConfig: DataSourceConfig = {
    workspaceAPIKey: connector.workspaceAPIKey,
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
  };
  const nangoConnectionId = connector.nangoConnectionId;

  const workflowId = getWorkflowId(dataSourceConfig);
  try {
    await client.workflow.start(workspaceFullSync, {
      args: [connectorId, dataSourceConfig, nangoConnectionId],
      taskQueue: "slack-queue",
      workflowId: workflowId,
    });
    logger.info(
      { workspaceId: dataSourceConfig.workspaceId },
      `Started Slack sync workflow with id ${workflowId}`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      { workspaceId: dataSourceConfig.workspaceId, error: e },
      `Failed starting the Slack sync. WorkflowId: ${workflowId}`
    );
    return new Err(e as Error);
  }
}

function getWorkflowId(dataSourceConfig: DataSourceInfo) {
  return `workflow-slack-${dataSourceConfig.workspaceId}-${dataSourceConfig.dataSourceName}`;
}
