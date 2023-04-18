import { SlackConfig, DustConfig } from './interface';
import axios, { AxiosRequestConfig } from 'axios';

import { WebClient } from '@slack/web-api';
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse';
import { Message } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import { ConversationsRepliesResponse } from '@slack/web-api/dist/response/ConversationsRepliesResponse';

const DUST_API_ENDPOINT = process.env.URL;

if (!DUST_API_ENDPOINT) {
  throw new Error('DUST_API_ENDPOINT not set');
}

export async function slackSyncThread(
  slackConfig: SlackConfig,
  dustConfig: DustConfig,
  channel_id: string,
  thread_ts: string
) {
  const client = new WebClient(slackConfig.accessToken);

  return await slackSyncThreadWithClient(client, dustConfig, channel_id, thread_ts);
}

export async function slackSyncThreadWithClient(
  client: WebClient,
  dustConfig: DustConfig,
  channel_id: string,
  thread_ts: string
) {
  console.log('syncing thread', channel_id, thread_ts);
  let allMessages: Message[] = [];
  const { channel } = await client.conversations.info({
    channel: channel_id,
  });
  if (!channel) {
    throw new Error('Channel not found for id ' + channel_id);
  }

  let next_cursor = undefined;

  do {
    const replies: ConversationsRepliesResponse = await client.conversations.replies({
      channel: channel_id,
      ts: thread_ts,
      cursor: next_cursor,
    });
    if (replies.error) {
      throw new Error(replies.error);
    }
    if (!replies.messages) {
      break;
    }
    allMessages = allMessages.concat(replies.messages);
    next_cursor = replies.response_metadata?.next_cursor;
  } while (next_cursor);

  await upsertToDatasource(allMessages, channel, dustConfig, thread_ts);
}

/**
 * Upsert a Slack thread to a Dust data source.
 */
export async function upsertToDatasource(
  messages: Message[],
  channel: Channel,
  dustConfig: DustConfig,
  thread_ts: string
) {
  const messages_from_thread = messages?.map((e) => e.text);
  const str_from_thread = messages_from_thread?.join('\n');
  if (!str_from_thread) {
    return;
  }

  const documentId = `${channel.name}-${thread_ts}`;
  const dust_url = `${DUST_API_ENDPOINT}/api/v1/data_sources/${dustConfig.username}/${dustConfig.datasourceId}/documents/${documentId}`;
  const dust_request_payload = {
    text: str_from_thread,
  };
  const dust_request_config: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dustConfig.APIKey}`,
    },
  };
  try {
    const dust_request_result = await axios.post(dust_url, dust_request_payload, dust_request_config);
    if (dust_request_result.status >= 200 && dust_request_result.status < 300) {
      console.log('successfully uploaded to do: ', dust_request_payload);
    }
  } catch (err: any) {
    console.error('Error uploading to dust: ', err.response.data);
  }
}
