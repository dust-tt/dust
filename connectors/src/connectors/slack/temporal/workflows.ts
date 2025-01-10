import type { ModelId } from "@dust-tt/types";
import {
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/slack/temporal/activities";

import { getWeekEnd, getWeekStart } from "../lib/utils";
import { newWebhookSignal, syncChannelSignal } from "./signals";

const {
  getChannel,
  syncChannel,
  fetchUsers,
  saveSuccessSyncActivity,
  reportInitialSyncProgressActivity,
  getChannelsToGarbageCollect,
  attemptChannelJoinActivity,
  deleteChannel,
  deleteChannelsFromConnectorDb,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { syncThread, syncNonThreaded } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

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
  const childWorkflowQueue = new PQueue({
    concurrency: 1,
  });
  setHandler(syncChannelSignal, async (input) => {
    for (const channelId of input.channelIds) {
      void childWorkflowQueue.add(async () => {
        await reportInitialSyncProgressActivity(
          connectorId,
          `${i - 1}/${input.channelIds.length} channels`
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
      });
    }
  });
  await fetchUsers(connectorId);
  await childWorkflowQueue.onIdle();

  await executeChild(slackGarbageCollectorWorkflow, {
    workflowId: slackGarbageCollectorWorkflowId(connectorId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    args: [connectorId],
    memo: workflowInfo().memo,
  });

  await saveSuccessSyncActivity(connectorId);
  console.log(`Workspace sync done for connector ${connectorId}`);
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
  const channelJoinSuccess = await attemptChannelJoinActivity(
    connectorId,
    channelId
  );
  if (!channelJoinSuccess) {
    return;
  }

  let messagesCursor: string | undefined = undefined;
  let weeksSynced: Record<number, boolean> = {};

  do {
    const syncChannelRes = await syncChannel(
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
    await saveSuccessSyncActivity(connectorId);
  }
}

export async function syncOneThreadDebounced(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    console.log("Got a new webhook ");
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount++;
      continue;
    }
    const channel = await getChannel(connectorId, channelId);
    if (!channel.name) {
      throw new Error(`Could not find channel name for channel ${channelId}`);
    }

    console.log(`Talked to slack after debouncing ${debounceCount} time(s)`);
    await syncThread(channelId, channel.name, threadTs, connectorId);
    await saveSuccessSyncActivity(connectorId);
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

  setHandler(newWebhookSignal, () => {
    console.log("Got a new webhook ");
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount++;
      console.log("Debouncing, sleep 10 secs");
      continue;
    }
    console.log(`Talked to slack after debouncing ${debounceCount} time(s)`);

    const channel = await getChannel(connectorId, channelId);
    if (!channel.name) {
      throw new Error(`Could not find channel name for channel ${channelId}`);
    }
    const messageTs = parseInt(threadTs) * 1000;
    const startTsMs = getWeekStart(new Date(messageTs)).getTime();
    const endTsMs = getWeekEnd(new Date(messageTs)).getTime();
    await syncNonThreaded(
      channelId,
      channel.name,
      startTsMs,
      endTsMs,
      connectorId
    );
    await saveSuccessSyncActivity(connectorId);
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
    await getChannelsToGarbageCollect(connectorId);
  for (const channelId of channelsToDeleteFromDataSource) {
    await deleteChannel(channelId, connectorId);
  }
  await deleteChannelsFromConnectorDb(
    channelsToDeleteFromConnectorsDb,
    connectorId
  );
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
