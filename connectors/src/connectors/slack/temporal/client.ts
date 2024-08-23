import type { ModelId } from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";

import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

import { getWeekStart } from "../lib/utils";
import { getChannelsToSync } from "./activities";
import { QUEUE_NAME } from "./config";
import { newWebhookSignal, syncChannelSignal } from "./signals";
import {
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
  connectorId: ModelId,
  fromTs: number | null,
  channelsToSync: string[] | null = null
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  if (channelsToSync === null) {
    channelsToSync = removeNulls(
      (await getChannelsToSync(connectorId)).map((c) => c.id || null)
    );
  }
  const client = await getTemporalClient();

  const dataSourceConfig: DataSourceConfig = {
    workspaceAPIKey: connector.workspaceAPIKey,
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
  };

  const workflowId = workspaceFullSyncWorkflowId(connectorId, fromTs);
  try {
    await client.workflow.signalWithStart(workspaceFullSync, {
      args: [connectorId, fromTs],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: syncChannelSignal,
      signalArgs: [{ channelIds: channelsToSync ? channelsToSync : [] }],
      memo: {
        connectorId: connectorId,
      },
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
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  if (connector.isPaused()) {
    logger.info(
      {
        connectorId: connector.id,
      },
      "Skipping webhook for Slack connector because it is paused (thread sync)."
    );

    return new Ok(undefined);
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
        searchAttributes: {
          connectorId: [connectorId],
        },
        signal: newWebhookSignal,
        signalArgs: undefined,
        memo: {
          connectorId: connectorId,
        },
      }
    );

    return new Ok(handle);
  } catch (e) {
    logger.error(
      { error: e, connectorId, channelId, threadTs, workflowId },
      "Failed launchSlackSyncOneThreadWorkflow"
    );
    return new Err(e as Error);
  }
}

export async function launchSlackSyncOneMessageWorkflow(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  if (connector.isPaused()) {
    logger.info(
      {
        connectorId: connector.id,
      },
      "Skipping webhook for Slack connector because it is paused (message sync)."
    );

    return new Ok(undefined);
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
        searchAttributes: {
          connectorId: [connectorId],
        },
        signal: newWebhookSignal,
        signalArgs: undefined,
        memo: {
          connectorId: connectorId,
        },
      }
    );

    return new Ok(handle);
  } catch (e) {
    logger.error(
      { error: e, connectorId, channelId, threadTs, workflowId },
      "Failed launchSlackSyncOneMessageWorkflow"
    );
    return new Err(e as Error);
  }
}

export async function launchSlackGarbageCollectWorkflow(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
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
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
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
