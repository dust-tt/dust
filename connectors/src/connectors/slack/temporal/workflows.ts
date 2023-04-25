import { executeChild, proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/slack/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getWeekEnd, getWeekStart } from "../lib/utils";

const {
  getChannels,
  getMessagesForChannel,
  syncThreads,
  syncMultipleNoNThreaded,
  getAccessToken,
  fetchUsers,
  saveSuccessSyncActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

/**
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
  connectorId: string,
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string
): Promise<void> {
  const slackAccessToken = await getAccessToken(nangoConnectionId);
  await fetchUsers(slackAccessToken, connectorId);
  const channels = await getChannels(slackAccessToken);
  for (const channel of channels) {
    await executeChild(workspaceSyncOneChannel.name, {
      args: [
        connectorId,
        nangoConnectionId,
        dataSourceConfig,
        channel.id,
        channel.name,
      ],
    });
  }
  await saveSuccessSyncActivity(connectorId);
  console.log(`Workspace sync done for connector ${connectorId}`);
}

export async function workspaceSyncOneChannel(
  connectorId: string,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig,
  channelId: string,
  channelName: string,
  messagesCursor?: string
) {
  console.log(`Syncing channel ${channelName} (${channelId})`);
  const threadsToSync: string[] = [];
  const unthreadedTimeframesToSync = new Map<
    string,
    { startTsMs: number; endTsMs: number }
  >();

  const slackAccessToken = await getAccessToken(nangoConnectionId);

  do {
    const messages = await getMessagesForChannel(
      slackAccessToken,
      channelId,
      100,
      messagesCursor
    );
    if (!messages.messages) {
      // This should never happen because we throw an exception in the activity if we get an error
      // from the Slack API, but we need to make typescript happy.
      break;
    }
    for (const message of messages.messages) {
      if (!message.user) {
        // We do not support messages not posted by users for now
        continue;
      }
      if (message.thread_ts) {
        if (threadsToSync.indexOf(message.thread_ts) === -1) {
          // We can end up getting two messages from the same thread if a message from a thread
          // has also been "posted to channel".
          threadsToSync.push(message.thread_ts);
        }
      } else {
        const messageTs = parseInt(message.ts as string, 10) * 1000;
        const weekStartTsMs = getWeekStart(new Date(messageTs)).getTime();
        const weekEndTsMss = getWeekEnd(new Date(messageTs)).getTime();

        unthreadedTimeframesToSync.set(`${weekStartTsMs}-${weekEndTsMss}`, {
          startTsMs: weekStartTsMs,
          endTsMs: weekEndTsMss,
        });
      }
    }
    await syncThreads(
      dataSourceConfig,
      slackAccessToken,
      channelId,
      channelName,
      threadsToSync,
      connectorId
    );
    threadsToSync.length = 0;

    messagesCursor = messages.response_metadata?.next_cursor;
  } while (messagesCursor);

  await syncMultipleNoNThreaded(
    slackAccessToken,
    dataSourceConfig,
    channelId,
    channelName,
    Array.from(unthreadedTimeframesToSync.values()),
    connectorId
  );
  console.log(`Syncing channel ${channelName} (${channelId}) done`);
}
