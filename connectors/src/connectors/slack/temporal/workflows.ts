import {
  continueAsNew,
  executeChild,
  log,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/slack/temporal/activities";
import type { ModelId } from "@connectors/types";

import {
  getActivitiesForConnector,
  getConnectorIdFromWorkflow,
} from "../../../lib/temporal_queue_routing";
import {
  getWeekEnd,
  getWeekStart,
  MAX_SYNC_NON_THREAD_MESSAGES,
} from "../lib/utils";
import { QUEUE_NAME } from "./config";
import { newWebhookSignal, syncChannelSignal } from "./signals";

// Configuration for slow lane routing.
const SLOW_LANE_CONNECTOR_IDS: string[] = [
  // Add connector IDs that should be routed to slow lane.
  "20542",
  "20640",
  "23791",
  "24659",
  "23840",
  "24497",
  "24948",
  "24473",
  "23796",
  "24378",
  "24272",
  "23913",
  "24295",
  "23697",
  "24289",
  "23703",
  "24432",
  "23760",
  "23726",
  "23919",
  "24051",
  "24536",
  "23917",
  "24287",
  "23922",
  "23978",
  "24302",
  "24385",
  "23756",
  "24268",
  "24114",
  "24581",
  "23852",
  "24266",
  "24838",
  "24801",
  "23805",
  "24606",
  "23717",
  "23164",
  "24623",
  "24768",
  "24080",
  "24750",
  "23876",
  "23741",
  "24400",
  "24588",
  "23844",
  "23786",
  "24754",
  "24879",
  "24171",
  "24878",
  "24505",
  "24712",
  "24875",
  "23936",
  "24310",
  "24090",
  "24075",
  "274877908648",
  "274877908541",
  "274877908701",
  "274877908661",
  "274877907284",
];

// Dynamic activity creation with fresh routing evaluation (enables retry queue switching).
function getSlackActivities() {
  const connectorId = getConnectorIdFromWorkflow();

  const {
    getChannel,
    fetchUsers,
    saveSuccessSyncActivity,
    syncChannelMetadata,
    reportInitialSyncProgressActivity,
    getChannelsToGarbageCollect,
    attemptChannelJoinActivity,
    deleteChannelsFromConnectorDb,
  } = getActivitiesForConnector<typeof activities>({
    baseQueue: QUEUE_NAME,
    connectorId,
    slowLaneConnectorIds: SLOW_LANE_CONNECTOR_IDS,
    activityOptions: { startToCloseTimeout: "10 minutes" },
  });

  const { deleteChannel, syncThread, syncChannel } = getActivitiesForConnector<
    typeof activities
  >({
    baseQueue: QUEUE_NAME,
    connectorId,
    slowLaneConnectorIds: SLOW_LANE_CONNECTOR_IDS,
    activityOptions: {
      heartbeatTimeout: "15 minutes",
      startToCloseTimeout: "90 minutes",
    },
  });

  const { syncNonThreadedChunk } = getActivitiesForConnector<typeof activities>(
    {
      baseQueue: QUEUE_NAME,
      connectorId,
      slowLaneConnectorIds: SLOW_LANE_CONNECTOR_IDS,
      activityOptions: {
        heartbeatTimeout: "5 minutes",
        startToCloseTimeout: "20 minutes",
      },
    }
  );

  return {
    attemptChannelJoinActivity,
    deleteChannel,
    deleteChannelsFromConnectorDb,
    fetchUsers,
    getChannel,
    getChannelsToGarbageCollect,
    reportInitialSyncProgressActivity,
    saveSuccessSyncActivity,
    syncChannel,
    syncChannelMetadata,
    syncNonThreadedChunk,
    syncThread,
  };
}

// we have a maximum of 990 signal received before we continue as new
// this is to avoid "Failed to signalWithStart Workflow: 3 INVALID_ARGUMENT: exceeded workflow execution limit for signal events"
const MAX_SIGNAL_RECEIVED_COUNT = 990;

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
        await getSlackActivities().reportInitialSyncProgressActivity(
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

  await getSlackActivities().fetchUsers(connectorId);
  await childWorkflowQueue.onIdle();

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
  let receivedSignalsCount = 0;

  setHandler(newWebhookSignal, async () => {
    receivedSignalsCount++;

    if (receivedSignalsCount >= MAX_SIGNAL_RECEIVED_COUNT) {
      log.info(
        `Continuing as Workflow as new due to too many signals received for syncOneThreadDebounced: ${receivedSignalsCount}`,
        {
          connectorId,
          channelId,
          threadTs,
          debounceCount,
          receivedSignalsCount,
        }
      );
      await continueAsNew(connectorId, channelId, threadTs);
      return;
    }
    signaled = true;
  });

  while (signaled) {
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
  // /!\ Any signal received outside of the while loop will be lost, so don't make any async
  // call here, which will allow the signal handler to be executed by the nodejs event loop. /!\
}

const INITIAL_CHUNK_SIZE_MS = 24 * 60 * 60 * 1000; // 24 hours.

export async function syncOneMessageDebounced(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  let signaled = false;
  let debounceCount = 0;
  let receivedSignalsCount = 0;

  setHandler(newWebhookSignal, async () => {
    receivedSignalsCount++;

    if (receivedSignalsCount >= MAX_SIGNAL_RECEIVED_COUNT) {
      log.info(
        `Continuing as Workflow as new due to too many signals received for syncOneMessageDebounced: ${receivedSignalsCount}`,
        {
          connectorId,
          channelId,
          threadTs,
          debounceCount,
          receivedSignalsCount,
        }
      );
      await continueAsNew(connectorId, channelId, threadTs);
      return;
    }
    signaled = true;
  });

  while (signaled) {
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

    let currentStartTsMs = startTsMs;
    let totalMessagesProcessed = 0;
    let cursor: string | undefined = undefined;

    while (
      currentStartTsMs < endTsMs &&
      totalMessagesProcessed < MAX_SYNC_NON_THREAD_MESSAGES
    ) {
      const chunkEndTsMs = Math.min(
        currentStartTsMs + INITIAL_CHUNK_SIZE_MS,
        endTsMs
      );

      const result = await getSlackActivities().syncNonThreadedChunk({
        channelId,
        channelName: channel.name,
        connectorId,
        endTsMs: chunkEndTsMs,
        isBatchSync: false,
        startTsMs: currentStartTsMs,
        weekStartTsMs: startTsMs,
        weekEndTsMs: endTsMs,
        cursor,
      });

      totalMessagesProcessed += result.messagesProcessed;

      if (result.completed) {
        currentStartTsMs = chunkEndTsMs;
        // Reset cursor for next time range.
        cursor = undefined;
      } else {
        // Keep same time range but continue with cursor.
        cursor = result.nextCursor;
      }
    }

    await getSlackActivities().saveSuccessSyncActivity(connectorId);
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
