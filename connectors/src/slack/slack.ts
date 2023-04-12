import { WebClient } from '@slack/web-api';
import { ConversationsListResponse } from '@slack/web-api/dist/response/ConversationsListResponse';
import { ConversationsHistoryResponse } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import axios, {AxiosRequestConfig} from 'axios';

export interface SlackConfig {
    accessToken: string;
}

export interface DustConfig {
    username: string;
    datasourceId: string;
    APIKey: string;
}

/**
 * Fetches all channels for a Slack workspace and processes them.
 * Calls to subsequent functions are made insde this function in order to handle
 * pagination without blowing up the memory of the process.
 * Another way to do that would be to use generator functions. TBD.
 * @param slack_token Oauth access token or Bot token
 * @param last_seen_ts only sync messages created after this timestamp.
 */
export async function processChannels(slackConfig: SlackConfig, dustConfig: DustConfig, last_seen_ts?: string) {
  const client = new WebClient(slackConfig.accessToken);
  let next_cursor = undefined;

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
        console.log('Processing channel: ', channel.name, channel.id);
        await processChannelMessages(client, channel.id, dustConfig, last_seen_ts);
      }
    }
    next_cursor = c.response_metadata?.next_cursor;
  } while (next_cursor);
}

/**
 * Fetch all messages from a given channel and process only threaded messages (for now).
 * @param client Slack api web client
 * @param channel_id channel id (EG: C01B1B2B3C4)
 * @param last_seen_ts only sync messages created after this timestamp.
 */
async function processChannelMessages(
  client: WebClient,
  channel_id: string,
  dustConfig: DustConfig,
  last_seen_ts?: string
) {
  let next_cursor = undefined;

  do {
    const history: ConversationsHistoryResponse = await client.conversations.history({
      channel: channel_id,
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
        await processMessageThread(client, channel_id, message.thread_ts, dustConfig);
      }
    }
  } while (next_cursor);
}

/**
 * Given a thread, format and upload the data to a dust core data source.
 * @param client Slack api web client
 * @param channel_id channel id (eg: C04T6JZ480N)
 * @param thread_ts the thread id we want to process. Slack mixes id and timestamp, so it's called thread_ts
 */
async function processMessageThread(client: WebClient, channel_id: string, thread_ts: string, dustConfig: DustConfig) {
  let next_cursor = undefined;
  do {
    const replies = await client.conversations.replies({ channel: channel_id, ts: thread_ts });
    console.log(
      'Should post this to a dust data source using the dust API. replies for thread: ',
      thread_ts,
      replies.messages?.map((e) => e.text)
    );
    await upsertToDatasource(replies, dustConfig, thread_ts);
    next_cursor = replies.response_metadata?.next_cursor;
  } while (next_cursor);
}

/**
 * Upsert a Slack thread to a Dust data source.
 */
async function upsertToDatasource(replies: ConversationsHistoryResponse, dustConfig: DustConfig, thread_ts: string) {
  
  
  const messages_from_thread = replies.messages?.map((e) => e.text);
  const str_from_thread = messages_from_thread?.join('\n');
  if (!str_from_thread) {
    return;
  }

  const dust_url = `http://localhost:3000/api/v1/data_sources/${dustConfig.username}/${dustConfig.datasourceId}/documents/${thread_ts}`;
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
