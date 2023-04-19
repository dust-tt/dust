import { WebClient } from '@slack/web-api';
import axios, { AxiosRequestConfig } from 'axios';
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse';
import { DustConfig, SlackConfig } from './interface';
import { Message } from '@slack/web-api/dist/response/ConversationsHistoryResponse';

const DUST_API_ENDPOINT = process.env.URL;

if (!DUST_API_ENDPOINT) {
  throw new Error('DUST_API_ENDPOINT not set');
}

export async function slackSyncChannelUnthreaded(dustConfig: DustConfig, channel: Channel, messages: Message[]) {
  if (messages.length === 0) {
    console.warn('slackSyncChannelUnthreaded: there is no messages here');
    return;
  }
  const firstMessage = messages[0];
  if (!firstMessage.ts) {
    console.error('slackSyncChannelUnthreaded: firstMessage.ts is undefined');
    return;
  }
  const dustSideUniqueId = getTimeKeyForMessage(firstMessage.ts);
  console.log('Syncing unthreaded messages', channel.name, dustSideUniqueId);
  await upsertToDatasource(messages, channel, dustConfig, dustSideUniqueId);
}

/**
 * Upsert a Slack thread to a Dust data source.
 */
async function upsertToDatasource(
  messages: Message[],
  channel: Channel,
  dustConfig: DustConfig,
  dustSideUniqueId: string
) {
  const messages_from_thread = messages?.map((e) => e.text);
  const str_from_thread = messages_from_thread?.join('\n');
  if (!str_from_thread) {
    return;
  }

  const documentId = `${channel.name}-unthreaded-${dustSideUniqueId}`;
  console.log('******* About to send unthreaded documentid', documentId)
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
      console.log('successfully uploaded to do: ', dustSideUniqueId);
    }
  } catch (err: any) {
    console.error('Error uploading to dust: ', err.response.data);
  }
}

export function getTimeKeyForMessage(messageTs: string): string {
  const dt = new Date(parseInt(messageTs, 10) * 1000);
  return `${dt.getFullYear()}-${dt.getMonth() + 1}`;
}
