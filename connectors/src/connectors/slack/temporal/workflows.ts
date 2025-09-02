import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import crypto from "crypto";

import type * as activities from "@connectors/connectors/slack/temporal/activities";
import type { ModelId } from "@connectors/types";
import { concurrentExecutor } from "@connectors/types";

import { getWeekEnd, getWeekStart } from "../lib/utils";
import { newWebhookSignal, syncChannelSignal } from "./signals";

// Dynamic activity creation with fresh routing evaluation (enables retry queue switching).
function getSlackActivities() {
  const {
    getChannel,
    fetchUsers,
    saveSuccessSyncActivity,
    syncChannelMetadata,
    reportInitialSyncProgressActivity,
    getChannelsToGarbageCollect,
    attemptChannelJoinActivity,
    deleteChannelsFromConnectorDb,
  } = proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
  });

  const { deleteChannel, syncThread, syncChannel } = proxyActivities<
    typeof activities
  >({
    heartbeatTimeout: "15 minutes",
    startToCloseTimeout: "90 minutes",
  });

  const { syncNonThreaded, migrateChannelsFromLegacyBotToNewBotActivity } =
    proxyActivities<typeof activities>({
      heartbeatTimeout: "5 minutes",
      startToCloseTimeout: "60 minutes",
    });

  return {
    attemptChannelJoinActivity,
    deleteChannel,
    deleteChannelsFromConnectorDb,
    fetchUsers,
    getChannel,
    getChannelsToGarbageCollect,
    migrateChannelsFromLegacyBotToNewBotActivity,
    reportInitialSyncProgressActivity,
    saveSuccessSyncActivity,
    syncChannel,
    syncChannelMetadata,
    syncNonThreaded,
    syncThread,
  };
}

// Max debounce
const MAX_DEBOUNCE_COUNT = 100;

/**
 * This workflow is in charge of synchronizing all the content of the Slack channels selected by the user.
 * The channel IDs are sent via Temporal signals.
 * For each channel id, we start a new child workflow, one after the other, with a concurrency of 1.
 * At the end, we start the garbage collector workflow.
 *
 * - Concurrency model:
 * One child workflow per Slack channel is triggered
 * For one channel:
 *  We fetch messages by batch of 100.
 *   We trigger 2 sync activities per batch of 100:
 *    One for all threaded messages
 *     Inside, we have one promise per thread
 *    One for all non threaded messages
 *     Inside, we have one promise per week
 *    Promises are sent and awaited by batch of activities.MAX_CONCURRENCY_LEVEL
 */
export async function workspaceFullSync(
  connectorId: ModelId,
  fromTs: number | null
): Promise<void> {
  let i = 1;
  const signalQueue: Array<{ channelIds: string[] }> = [];

  setHandler(syncChannelSignal, async (input) => {
    // Add signal to queue
    signalQueue.push(input);
  });

  await getSlackActivities().fetchUsers(connectorId);

  while (signalQueue.length > 0) {
    const signal = signalQueue.shift();
    if (!signal) {
      continue;
    }

    // Process channels sequentially for this signal
    for (const channelId of signal.channelIds) {
      await getSlackActivities().reportInitialSyncProgressActivity(
        connectorId,
        `${i - 1}/${signal.channelIds.length} channels`
      );

      await executeChild(syncOneChannel, {
        workflowId: syncOneChanneWorkflowlId(connectorId, channelId),
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [connectorId, channelId, false, fromTs],
        memo: workflowInfo().memo,
      });

      i++;
    }
  }

  await executeChild(slackGarbageCollectorWorkflow, {
    workflowId: slackGarbageCollectorWorkflowId(connectorId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    args: [connectorId],
    memo: workflowInfo().memo,
  });

  await getSlackActivities().saveSuccessSyncActivity(connectorId);
}

/**
 * This workflow is in charge of synchronizing all the content of a Slack channel.
 * A thread with more than one message is indexed as one document, and a the non threaded message of a channel are indexed
 * as a document per week.
 */
export async function syncOneChannel(
  connectorId: ModelId,
  channelId: string,
  updateSyncStatus: boolean,
  fromTs: number | null
) {
  const channelJoinSuccess =
    await getSlackActivities().attemptChannelJoinActivity(
      connectorId,
      channelId
    );
  if (!channelJoinSuccess) {
    return;
  }

  let messagesCursor: string | undefined = undefined;
  let weeksSynced: Record<number, boolean> = {};

  do {
    const syncChannelRes = await getSlackActivities().syncChannel(
      channelId,
      connectorId,
      fromTs,
      weeksSynced,
      messagesCursor
    );
    if (syncChannelRes) {
      messagesCursor = syncChannelRes.nextCursor;
      weeksSynced = syncChannelRes.weeksSynced;
    }
  } while (messagesCursor);

  if (updateSyncStatus) {
    await getSlackActivities().saveSuccessSyncActivity(connectorId);
  }
}

export async function syncOneThreadDebounced(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, async () => {
    signaled = true;
  });

  while (signaled && debounceCount < MAX_DEBOUNCE_COUNT) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount++;
      continue;
    }

    const channel = await getSlackActivities().getChannel(
      connectorId,
      channelId
    );
    if (!channel.name) {
      throw new Error(`Could not find channel name for channel ${channelId}`);
    }

    await getSlackActivities().syncChannelMetadata(
      connectorId,
      channelId,
      parseInt(threadTs, 10) * 1000
    );
    await getSlackActivities().syncThread(
      channelId,
      channel.name,
      threadTs,
      connectorId
    );
    await getSlackActivities().saveSuccessSyncActivity(connectorId);
  }

  // If we hit max iterations, continue as new
  if (debounceCount >= MAX_DEBOUNCE_COUNT) {
    await continueAsNew(connectorId, channelId, threadTs);
  }

  // /!\ Any signal received outside of the while loop will be lost, so don't make any async
  // call here, which will allow the signal handler to be executed by the nodejs event loop. /!\
}

export async function syncOneMessageDebounced(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, async () => {
    signaled = true;
  });

  while (signaled && debounceCount < MAX_DEBOUNCE_COUNT) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount++;
      continue;
    }

    const channel = await getSlackActivities().getChannel(
      connectorId,
      channelId
    );
    if (!channel.name) {
      throw new Error(`Could not find channel name for channel ${channelId}`);
    }
    const messageTs = parseInt(threadTs, 10) * 1000;
    const startTsMs = getWeekStart(new Date(messageTs)).getTime();
    const endTsMs = getWeekEnd(new Date(messageTs)).getTime();

    await getSlackActivities().syncChannelMetadata(
      connectorId,
      channelId,
      endTsMs
    );

    await getSlackActivities().syncNonThreaded({
      channelId,
      channelName: channel.name,
      connectorId,
      endTsMs,
      startTsMs,
    });

    await getSlackActivities().saveSuccessSyncActivity(connectorId);
  }

  // If we hit max iterations, continue as new
  if (debounceCount >= MAX_DEBOUNCE_COUNT) {
    await continueAsNew(connectorId, channelId, threadTs);
  }

  // /!\ Any signal received outside of the while loop will be lost, so don't make any async
  // call here, which will allow the signal handler to be executed by the nodejs event loop. /!\
}

/**
 * This workflow is in charge of cleaning up the connector's database and the data source.
 * It finds all the channels that are still indexed in our database but not selected in the connector's configuration,
 * and deletes them.
 */
export async function slackGarbageCollectorWorkflow(
  connectorId: ModelId
): Promise<void> {
  const { channelsToDeleteFromConnectorsDb, channelsToDeleteFromDataSource } =
    await getSlackActivities().getChannelsToGarbageCollect(connectorId);
  for (const channelId of channelsToDeleteFromDataSource) {
    await getSlackActivities().deleteChannel(channelId, connectorId);
  }
  await getSlackActivities().deleteChannelsFromConnectorDb(
    channelsToDeleteFromConnectorsDb,
    connectorId
  );
}

// TODO(slack 2025-07-30): Temporary workflow to migrate channels from legacy bot to new bot.
export async function migrateChannelsFromLegacyBotToNewBotWorkflow(
  slackConnectorId: ModelId,
  slackBotConnectorId: ModelId
) {
  await getSlackActivities().migrateChannelsFromLegacyBotToNewBotActivity(
    slackConnectorId,
    slackBotConnectorId
  );
}

export function migrateChannelsFromLegacyBotToNewBotWorkflowId(
  slackConnectorId: ModelId,
  slackBotConnectorId: ModelId
) {
  return `slack-migrateChannelsFromLegacyBotToNewBot-${slackConnectorId}-${slackBotConnectorId}`;
}

export function workspaceFullSyncWorkflowId(
  connectorId: ModelId,
  fromTs: number | null
) {
  if (fromTs) {
    return `slack-workspaceFullSync-${connectorId}-fromTs-${fromTs}`;
  }
  return `slack-workspaceFullSync-${connectorId}`;
}

export function syncOneChanneWorkflowlId(
  connectorId: ModelId,
  channelId: string
) {
  return `slack-syncOneChannel-${connectorId}-${channelId}`;
}

export function syncOneThreadDebouncedWorkflowId(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  return `slack-syncOneThreadDebounced-${connectorId}-${channelId}-${threadTs}`;
}

export function syncOneMessageDebouncedWorkflowId(
  connectorId: ModelId,
  channelId: string,
  startTsMs: number
) {
  return `slack-syncOneMessageDebounced-${connectorId}-${channelId}-${startTsMs}`;
}

export function slackGarbageCollectorWorkflowId(connectorId: ModelId) {
  return `slack-GarbageCollector-${connectorId}`;
}

// Configure attemptChannelJoinActivity with aggressive retries for joinChannels workflow
const { attemptChannelJoinActivity: attemptChannelJoinWithRetries } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
    retry: {
      maximumAttempts: 25,
      initialInterval: "5s",
      maximumInterval: "15s",
      backoffCoefficient: 1.5,
    },
  });

/**
 * Workflow to join multiple Slack channels in batch with retries.
 * Processes channels with a concurrency of 10.
 * By default, fails if more than 250 channels are provided.
 */
export async function joinChannelsWorkflow(
  connectorId: ModelId,
  channelIds: string[]
): Promise<void> {
  const MAX_CHANNELS = 250;
  const CONCURRENCY = 10;

  // Fail if more than 250 channels are provided
  if (channelIds.length > MAX_CHANNELS) {
    throw new Error(
      `Cannot join more than ${MAX_CHANNELS} channels in a single workflow. Received ${channelIds.length} channels.`
    );
  }

  // Execute channel joins concurrently
  await concurrentExecutor(
    channelIds,
    async (channelId) => {
      await attemptChannelJoinWithRetries(connectorId, channelId);
    },
    { concurrency: CONCURRENCY }
  );
}

export function joinChannelsWorkflowId(
  connectorId: ModelId,
  channelIds: string[]
) {
  // Create a hash of the channel IDs to ensure unique workflow ID for each set
  const channelsHash = crypto
    .createHash("sha256")
    .update(channelIds.sort().join(","))
    .digest("hex")
    .substring(0, 8); // Use first 8 chars of hash for readability
  return `slack-joinChannels-${connectorId}-${channelsHash}`;
}
