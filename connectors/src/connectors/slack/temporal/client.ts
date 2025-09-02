import { Err, Ok, removeNulls } from "@dust-tt/client";

import { getChannelsToSync } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { SlackMessages } from "@connectors/lib/models/slack";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

import { getWeekStart } from "../lib/utils";
import { QUEUE_NAME } from "./config";
import { newWebhookSignal, syncChannelSignal } from "./signals";
import {
  joinChannelsWorkflow,
  joinChannelsWorkflowId,
  migrateChannelsFromLegacyBotToNewBotWorkflow,
  migrateChannelsFromLegacyBotToNewBotWorkflowId,
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
    const slackClient = await getSlackClient(connectorId);
    channelsToSync = removeNulls(
      (await getChannelsToSync(slackClient, connectorId)).map(
        (c) => c.id || null
      )
    );
  }
  const client = await getTemporalClient();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

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
    return new Err(normalizeError(e));
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
      "Skipping Slack connector because it is paused (thread sync)."
    );

    return new Ok(undefined);
  }

  const thread = await SlackMessages.findOne({
    where: {
      connectorId: connectorId,
      channelId: channelId,
      messageTs: threadTs,
    },
  });
  if (thread && thread.skipReason) {
    logger.info(
      {
        connectorId,
        channelId,
        threadTs,
        skipReason: thread.skipReason,
      },
      `Skipping thread : ${thread.skipReason}`
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
    return new Err(normalizeError(e));
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

  const thread = await SlackMessages.findOne({
    where: {
      connectorId: connectorId,
      channelId: channelId,
      messageTs: threadTs,
    },
  });
  if (thread && thread.skipReason) {
    logger.info(
      {
        connectorId,
        channelId,
        threadTs,
        skipReason: thread.skipReason,
      },
      `Skipping thread : ${thread.skipReason}`
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
    return new Err(normalizeError(e));
  }
}

export async function launchSlackGarbageCollectWorkflow(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  if (connector.isPaused()) {
    logger.info(
      {
        connectorId: connector.id,
      },
      "Skipping webhook for Slack connector because it is paused (garbage collect)."
    );
    return new Ok(undefined);
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
    return new Err(normalizeError(e));
  }
}

export async function launchSlackMigrateChannelsFromLegacyBotToNewBotWorkflow(
  slackConnectorId: ModelId,
  slackBotConnectorId: ModelId
) {
  const client = await getTemporalClient();

  const workflowId = migrateChannelsFromLegacyBotToNewBotWorkflowId(
    slackConnectorId,
    slackBotConnectorId
  );
  try {
    await client.workflow.start(migrateChannelsFromLegacyBotToNewBotWorkflow, {
      args: [slackConnectorId, slackBotConnectorId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [slackConnectorId],
      },
      memo: {
        connectorId: slackConnectorId,
      },
    });
    logger.info(
      {
        workflowId,
      },
      "Started migrateChannelsFromLegacyBotToNewBot workflow."
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed starting migrateChannelsFromLegacyBotToNewBot workflow."
    );
    return new Err(normalizeError(e));
  }
}

/**
 * Launch workflow(s) to join Slack channels.
 * Returns workflow handles that the caller can await.
 *
 * @param connectorId - The connector ID
 * @param channelIds - Array of channel IDs to join
 * @param allowUnlimitedChannels - If true, allows processing more than 250 channels
 *                                  by splitting them into multiple workflows.
 *                                  If false (default), returns an error if more than 250 channels are provided.
 */
export async function launchSlackJoinChannelsWorkflow(
  connectorId: ModelId,
  channelIds: string[],
  allowUnlimitedChannels: boolean = false
) {
  const MAX_CHANNELS_PER_WORKFLOW = 250;

  if (channelIds.length === 0) {
    return new Ok([]);
  }

  // Check if we exceed the limit without permission
  if (
    !allowUnlimitedChannels &&
    channelIds.length > MAX_CHANNELS_PER_WORKFLOW
  ) {
    return new Err(
      new Error(
        `Cannot join more than ${MAX_CHANNELS_PER_WORKFLOW} channels without allowUnlimitedChannels flag. ` +
          `Received ${channelIds.length} channels.`
      )
    );
  }

  const client = await getTemporalClient();

  // Split into batches if needed
  const batches: string[][] = [];
  for (let i = 0; i < channelIds.length; i += MAX_CHANNELS_PER_WORKFLOW) {
    batches.push(channelIds.slice(i, i + MAX_CHANNELS_PER_WORKFLOW));
  }

  logger.info(
    {
      connectorId,
      totalChannels: channelIds.length,
      batchCount: batches.length,
    },
    batches.length > 1
      ? "Starting multiple channel join workflows for bulk operation."
      : "Starting channel join workflow."
  );

  try {
    // Launch all workflows and return handles
    const handles = await Promise.all(
      batches.map(async (batch) => {
        const workflowId = joinChannelsWorkflowId(connectorId, batch);
        const handle = await client.workflow.start(joinChannelsWorkflow, {
          args: [connectorId, batch],
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
            channelCount: batch.length,
          },
          "Started joinChannels workflow."
        );

        return handle;
      })
    );

    return new Ok(handles);
  } catch (e) {
    logger.error(
      {
        connectorId,
        error: e,
      },
      "Failed starting channel join workflows."
    );
    return new Err(normalizeError(e));
  }
}

/**
 * Launch workflow(s) to join Slack channels and wait for completion.
 * This is a convenience wrapper that launches and waits for the workflows.
 */
export async function launchSlackJoinChannelsWorkflowAndWait(
  connectorId: ModelId,
  channelIds: string[],
  allowUnlimitedChannels: boolean = false
) {
  const launchResult = await launchSlackJoinChannelsWorkflow(
    connectorId,
    channelIds,
    allowUnlimitedChannels
  );

  if (launchResult.isErr()) {
    return launchResult;
  }

  const handles = launchResult.value;

  try {
    // Wait for all workflows to complete
    await Promise.all(handles.map((handle) => handle.result()));

    logger.info(
      {
        connectorId,
        workflowCount: handles.length,
      },
      "All channel join workflows completed successfully."
    );

    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        connectorId,
        error: e,
      },
      "Failed executing channel join workflows."
    );
    return new Err(normalizeError(e));
  }
}
