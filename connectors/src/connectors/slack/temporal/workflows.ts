import {
  allHandlersFinished,
  condition,
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/slack/temporal/activities";
import type { ModelId } from "@connectors/types";

import { getWeekEnd, getWeekStart } from "../lib/utils";
import { newWebhookSignal, syncChannelSignal } from "./signals";

const JOIN_CHANNEL_USE_CASES = [
  "join-only",
  "auto-read",
  "set-permission",
] as const;
export type JoinChannelUseCaseType = (typeof JOIN_CHANNEL_USE_CASES)[number];

// Dynamic activity creation with fresh routing evaluation (enables retry queue switching).
function getSlackActivities() {
  const {
    getChannel,
    saveSuccessSyncActivity,
    syncChannelMetadata,
    reportInitialSyncProgressActivity,
    getChannelsToGarbageCollect,
    deleteChannelsFromConnectorDb,
  } = proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
  });

  const { attemptChannelJoinActivity } = proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
    retry: {
      initialInterval: "3s",
      maximumInterval: "12s",
      backoffCoefficient: 1.5,
      maximumAttempts: 25,
    },
  });

  const { autoReadChannelActivity } = proxyActivities<typeof activities>({
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
    autoReadChannelActivity,
    deleteChannel,
    deleteChannelsFromConnectorDb,
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
    if (!channel || !channel.name) {
      throw new Error(
        `Could not find channel or channel name for channel ${channelId}`
      );
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

  // If we hit max iterations, ensure all handlers are finished before continuing as new.
  if (debounceCount >= MAX_DEBOUNCE_COUNT) {
    // Unregister the signal handler to prevent new signals from being accepted.
    setHandler(newWebhookSignal, undefined);
    // Wait for any in-progress async handlers to complete.
    await condition(allHandlersFinished);
    // Now safe to continue as new without losing signals or corrupting state.
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
    if (!channel || !channel.name) {
      throw new Error(
        `Could not find channel or channel name for channel ${channelId}`
      );
    }
    const messageTs = parseInt(threadTs, 10) * 1000;
    const startTsMs = getWeekStart(new Date(messageTs)).getTime();
    const endTsMs = getWeekEnd(new Date(messageTs)).getTime();

    await getSlackActivities().syncChannelMetadata(
      connectorId,
      channelId,
      // endTsMs can be in the future so we cap it to now for the channel metadata.
      Math.min(new Date().getTime(), endTsMs)
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

  // If we hit max iterations, ensure all handlers are finished before continuing as new.
  if (debounceCount >= MAX_DEBOUNCE_COUNT) {
    // Unregister the signal handler to prevent new signals from being accepted.
    setHandler(newWebhookSignal, undefined);
    // Wait for any in-progress async handlers to complete.
    await condition(allHandlersFinished);
    // Now safe to continue as new without losing signals or corrupting state.
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

export async function joinChannelWorkflow(
  connectorId: ModelId,
  channelId: string,
  useCase: JoinChannelUseCaseType
): Promise<{ success: boolean; error?: string }> {
  if (useCase === "set-permission") {
    throw new Error("set-permission use case not implemented");
  }

  try {
    const joinSuccess = await getSlackActivities().attemptChannelJoinActivity(
      connectorId,
      channelId
    );

    if (!joinSuccess) {
      return {
        success: false,
        error: "Channel is archived or could not be joined",
      };
    }

    if (useCase === "auto-read") {
      await getSlackActivities().autoReadChannelActivity(
        connectorId,
        channelId
      );
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export function joinChannelWorkflowId(
  connectorId: ModelId,
  channelId: string,
  useCase: JoinChannelUseCaseType
) {
  return `slack-joinChannel-${useCase}-${connectorId}-${channelId}`;
}
