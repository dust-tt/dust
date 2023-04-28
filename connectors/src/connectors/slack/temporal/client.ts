import { Connector } from "@connectors/lib/models";
import { Err, Ok } from "@connectors/lib/result";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

import { newWebhookSignal } from "./signals";
import {
  syncOneMessageDebounced,
  syncOneThreadDebounced,
  workspaceFullSync,
} from "./workflows";

export async function launchSlackSyncWorkflow(connectorId: string) {
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

export async function launchSlackSyncOneThreadWorkflow(
  connectorId: string,
  channelId: string,
  threadTs: string
) {
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

  const workflowId = `slackSyncOneThreadWorkflow-${connectorId}-${threadTs}`;
  try {
    const handle = await client.workflow.signalWithStart(
      syncOneThreadDebounced,
      {
        args: [
          connectorId,
          dataSourceConfig,
          nangoConnectionId,
          channelId,
          threadTs,
        ],
        taskQueue: "slack-queue",
        workflowId: workflowId,
        signal: newWebhookSignal,
        signalArgs: undefined,
      }
    );

    return new Ok(handle);
  } catch (e) {
    return new Err(e as Error);
  }
}

export async function launchSlackSyncOneMessageWorkflow(
  connectorId: string,
  channelId: string,
  threadTs: string
) {
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

  const workflowId = `slackSyncOneMessageWorkflow-${connectorId}-${threadTs}`;
  try {
    const handle = await client.workflow.signalWithStart(
      syncOneMessageDebounced,
      {
        args: [
          connectorId,
          dataSourceConfig,
          nangoConnectionId,
          channelId,
          threadTs,
        ],
        taskQueue: "slack-queue",
        workflowId: workflowId,
        signal: newWebhookSignal,
        signalArgs: undefined,
      }
    );

    return new Ok(handle);
  } catch (e) {
    return new Err(e as Error);
  }
}

function getWorkflowId(dataSourceConfig: DataSourceInfo) {
  return `workflow-slack-${dataSourceConfig.workspaceId}-${dataSourceConfig.dataSourceName}`;
}
