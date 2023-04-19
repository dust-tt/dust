import { WebClient } from '@slack/web-api';
import { ConversationsListResponse, Channel } from '@slack/web-api/dist/response/ConversationsListResponse';
import { ConversationsHistoryResponse } from '@slack/web-api/dist/response/ConversationsHistoryResponse';

import { SlackConfig, DustConfig } from './interface';
import { slackSyncThreadWithClient } from './sync_thread';

import { Ok, Err, Result } from '@app/lib/result';
import { getTimeKeyForMessage, slackSyncChannelUnthreaded } from './sync_channel_unthreaded';

export async function getAllChannelsActivity(slackConfig: SlackConfig): Promise<Channel[]> {
  const client = new WebClient(slackConfig.accessToken);
  const allChannels = [];
  let nextCursor : string | undefined = undefined;
  do {
    const c : ConversationsListResponse = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000,
      cursor: nextCursor
    });
    nextCursor = c?.response_metadata?.next_cursor;
    if (c.error) {
      throw new Error(c.error);
    }
    if (!c.channels) {
      throw new Error('There was no channels in the response for cursor ' + c?.response_metadata?.next_cursor + '');
    }
    for (const channel of c.channels) {
      if (channel && channel.id) {
        if (channel.is_member) {
          allChannels.push(channel);
        }
      }
    }
  } while (nextCursor);

  return allChannels;
}

export async function getMessagesForChannelActivity(slackConfig: SlackConfig, channelId: string, previousResponse?: ConversationsHistoryResponse): Promise<ConversationsHistoryResponse> {
  const client = new WebClient(slackConfig.accessToken);

  const c: ConversationsHistoryResponse = await client.conversations.history({
    channel: channelId,
    limit: 1000,
    cursor: previousResponse?.response_metadata?.next_cursor,
  });

  return c;
}


export async function fullSyncGetChannels(
  slackConfig: SlackConfig,
  dustConfig: DustConfig,
  last_seen_ts?: string,
  next_cursor?: string
): Promise<ConversationsListResponse> {
  const client = new WebClient(slackConfig.accessToken);

  const c: ConversationsListResponse = await client.conversations.list({
    types: 'public_channel,private_channel',
    limit: 1000,
    cursor: next_cursor,
  });

  return c;
}

export async function printChannel(channel: Channel) {
  console.log(channel.name);
}

export async function syncAllChannels(slackConfig: SlackConfig, dustConfig: DustConfig, last_seen_ts?: string) {
  const client = new WebClient(slackConfig.accessToken);

  let next_cursor: string | undefined = undefined;

  do {
    const c: ConversationsListResponse = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000,
      cursor: next_cursor,
    });
    if (c.error) {
      throw new Error(c.error);
    }
    if (!c.channels) {
      break;
    }
    for (const channel of c.channels) {
      if (channel && channel.id) {
        if (channel.is_member) {
          await processChannelMessages(client, channel, dustConfig, last_seen_ts);
        }
      }
    }
    next_cursor = c.response_metadata?.next_cursor;
  } while (next_cursor);

  console.log('DONE!!!!!!!!!');
}

async function processChannelMessages(
  client: WebClient,
  channel: Channel,
  dustConfig: DustConfig,
  last_seen_ts?: string
): Promise<Result<void, Error>> {
  let next_cursor: string | undefined = undefined;

  if (!channel.id) {
    return new Err(new Error('Channel id is undefined'));
  }
  const allPromises = [];
  const unthreadedMessages = [];
  let lastUnthreadedTimeKey: string | undefined = undefined;
  do {
    console.log('getting history', channel.id, next_cursor);
    const history: ConversationsHistoryResponse = await client.conversations.history({
      channel: channel.id,
      limit: 1000,
      include_all_metadata: true,
      cursor: next_cursor,
      oldest: last_seen_ts,
    });
    next_cursor = history.response_metadata?.next_cursor;
    if (history.error) {
      throw new Error(history.error);
    }
    if (!history.messages) {
      continue;
    }

    for (const message of history.messages) {
      if (message.thread_ts) {
        const promise = slackSyncThreadWithClient(client, dustConfig, channel.id, message.thread_ts);
        allPromises.push(promise);
      } else if (message.ts) {
        if (lastUnthreadedTimeKey === undefined) {
          unthreadedMessages.push(message);
          lastUnthreadedTimeKey = getTimeKeyForMessage(message.ts);
        } else if (lastUnthreadedTimeKey === getTimeKeyForMessage(message.ts)) {
          unthreadedMessages.push(message);
        } else {
          if (unthreadedMessages.length > 0) {
            const promise = slackSyncChannelUnthreaded(dustConfig, channel, unthreadedMessages);
            allPromises.push(promise);
            unthreadedMessages.length = 0;
            lastUnthreadedTimeKey = getTimeKeyForMessage(message.ts);
            unthreadedMessages.push(message);
          }
        }
      }
      // if (allPromises.length === 10) {
      //   await Promise.all(allPromises);
      //   allPromises.length = 0;
      // }
    }
  } while (next_cursor);

  if (unthreadedMessages.length > 0) {
    console.log('!! pushing last messages to promises list', unthreadedMessages.length);
    const promise = slackSyncChannelUnthreaded(dustConfig, channel, unthreadedMessages);
    allPromises.push(promise);
    unthreadedMessages.length = 0;
  } else {
    console.log('!! No more unthreaded messages to push', unthreadedMessages.length);
  }

  // console.log('awaiting on last promises', allPromises.length);
  // await Promise.all(allPromises);
  // console.log('Done waiting on last promises', allPromises.length);

  return new Ok(undefined);
}

export async function slowActivity() {
  console.log('sleeping');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log('done sleeping');
}
