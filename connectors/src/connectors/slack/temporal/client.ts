import { Connector, ModelId } from "@connectors/lib/models";
import { Err, Ok } from "@connectors/lib/result";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getWeekStart } from "../lib/utils";
import { QUEUE_NAME } from "./config";
import { botJoinedChanelSignal, newWebhookSignal } from "./signals";
import {
  botJoinedChannelWorkflowId,
  memberJoinedChannel,
  slackGarbageCollectorWorkflow,
  slackGarbageCollectorWorkflowId,
  syncOneMessageDebounced,
  syncOneMessageDebouncedWorkflowId,
  syncOneThreadDebounced,
  syncOneThreadDebouncedWorkflowId,
  workspaceFullSync,
  workspaceFullSyncWorkflowId,
} from "./workflows";

const logger = mainLogger.child({ provider: "slack" });

export async function launchSlackSyncWorkflow(
  connectorId: string,
  fromTs: number | null
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
  const nangoConnectionId = connector.connectionId;

  const workflowId = workspaceFullSyncWorkflowId(parseInt(connectorId), fromTs);
  try {
    await client.workflow.start(workspaceFullSync, {
      args: [
        parseInt(connectorId),
        dataSourceConfig,
        nangoConnectionId,
        fromTs,
      ],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started Slack sync workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting the Slack sync.`
    );
    return new Err(e as Error);
  }
}

export async function launchSlackSyncOneThreadWorkflow(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const workflowId = syncOneThreadDebouncedWorkflowId(
    connectorId,
    channelId,
    threadTs
  );
  try {
    const handle = await client.workflow.signalWithStart(
      syncOneThreadDebounced,
      {
        args: [connectorId, channelId, threadTs],
        taskQueue: QUEUE_NAME,
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
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const messageTs = parseInt(threadTs as string) * 1000;
  const weekStartTsMs = getWeekStart(new Date(messageTs)).getTime();
  const workflowId = syncOneMessageDebouncedWorkflowId(
    connectorId,
    channelId,
    weekStartTsMs
  );
  try {
    const handle = await client.workflow.signalWithStart(
      syncOneMessageDebounced,
      {
        args: [connectorId, channelId, threadTs],
        taskQueue: QUEUE_NAME,
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

export async function launchSlackSyncOneChannelDebouncedWorkflow(
  connectorId: ModelId,
  channelId: string
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const workflowId = botJoinedChannelWorkflowId(connectorId);
  try {
    await client.workflow.signalWithStart(memberJoinedChannel, {
      args: [connectorId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      signal: botJoinedChanelSignal,
      signalArgs: [{ channelId: channelId }],
    });
    logger.info(
      {
        workspaceId: connector.workspaceId,
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: connector.workspaceId,
        workflowId,
        error: e,
      },
      `Failed to start worklfow.`
    );
    return new Err(e as Error);
  }
}

export async function launchSlackGarbageCollectWorkflow(connectorId: ModelId) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();

  const workflowId = slackGarbageCollectorWorkflowId(connectorId);
  try {
    await client.workflow.start(slackGarbageCollectorWorkflow, {
      args: [connectorId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
    });
    logger.info(
      {
        workflowId,
      },
      `Started slackGarbageCollector workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting slackGarbageCollector workflow.`
    );
    return new Err(e as Error);
  }
}
