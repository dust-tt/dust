import { WebClient } from '@slack/web-api';
import { ConversationsListResponse, Channel } from '@slack/web-api/dist/response/ConversationsListResponse';
import { ConversationsHistoryResponse } from '@slack/web-api/dist/response/ConversationsHistoryResponse';

import { SlackConfig, DustConfig } from './interface';
import { slackSyncThreadWithClient } from './sync_thread';

import { Ok, Err, Result } from '@app/lib/result';

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
          console.log('Processing channel: ', channel.name, channel.id);
          await processChannelMessages(client, channel, dustConfig, last_seen_ts);
        }
      }
    }
    next_cursor = c.response_metadata?.next_cursor;
  } while (next_cursor);
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
  do {
    const history: ConversationsHistoryResponse = await client.conversations.history({
      channel: channel.id,
      limit: 100,
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
        await slackSyncThreadWithClient(client, dustConfig, channel.id, message.thread_ts);
      } else {
        // slackSyncChannelUnthreaded(client, dustConfig, channel.id, message.ts)
      }
    }
  } while (next_cursor);

  return new Ok(undefined);
}
