import { proxyActivities, executeChild } from '@temporalio/workflow';
// Only import the activity types
import type * as slack_activities from './full_sync';
import type * as sync_thread_activities from './sync_thread';
import { DustConfig, SlackConfig } from './interface';
import type * as info_activities from './info';

import { ConversationsHistoryResponse } from '@slack/web-api/dist/response/ConversationsHistoryResponse';

const activitiesOptions = {
  startToCloseTimeout: '180 minute',
  retry: {
    maximumAttempts: 2,
  },
};

const {  getMessagesForChannelActivity, getAllChannelsActivity } = proxyActivities<
  typeof slack_activities
>(activitiesOptions);

const { slackSyncThread } = proxyActivities<
  typeof sync_thread_activities
>(activitiesOptions);

const { getTeamId } = proxyActivities<
  typeof info_activities
>(activitiesOptions);


export async function slack_workflow_fullsync(slackConfig: SlackConfig, dustConfig: DustConfig): Promise<void> {
  const channels = await getAllChannelsActivity(slackConfig);
  console.log('******** got channels', channels.length)
  const allPromises = []
  for (const channel of channels) {
    if (!channel.id) {
      continue;
    }
    if (!channel.is_member) {
      continue;
    }
    console.log('going to execute child workflow for channel', channel.name);
    const promise =  executeChild(slack_workflow_fullsync_one_channel, {
      args: [slackConfig, dustConfig, channel.id],
    });
    allPromises.push(promise);
  }
  await Promise.all(allPromises);
}

export async function slack_workflow_fullsync_one_channel(
  slackConfig: SlackConfig,
  dustConfig: DustConfig,
  channelId: string
) {
  const allPromises = []
  let messagesRes : ConversationsHistoryResponse | undefined = undefined;

  do {
    messagesRes = await getMessagesForChannelActivity(slackConfig, channelId, messagesRes);
    if (messagesRes.error) {
      throw new Error(messagesRes.error);
    }
    if (!messagesRes.messages) {
      break;
    }
    for (const message of messagesRes.messages) {
      if (message.thread_ts) {
        const promise =  slackSyncThread(slackConfig, dustConfig, channelId, message.thread_ts);
        allPromises.push(promise);
      }
      if (allPromises.length === 10) {
        await Promise.all(allPromises);
        allPromises.length = 0;
      }
    }
  } while (messagesRes?.response_metadata?.next_cursor);
  
  await Promise.all(allPromises);
}

export async function slackSyncOneThreadWorkflow(slackConfig: SlackConfig, dustConfig: DustConfig, channelId: string, threadId: string) {
  await slackSyncThread(slackConfig, dustConfig, channelId, threadId);
}

export async function getTeamIdWorkflow(slackConfig: SlackConfig) : Promise<string> {
  return await getTeamId(slackConfig);
}
