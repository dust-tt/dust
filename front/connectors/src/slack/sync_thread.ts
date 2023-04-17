import { SlackConfig, DustConfig } from "./interface";
import axios, { AxiosRequestConfig } from "axios";

import { WebClient } from "@slack/web-api";
import {
  ConversationsListResponse,
  Channel,
} from "@slack/web-api/dist/response/ConversationsListResponse";
import {
  ConversationsHistoryResponse,
  Message,
} from "@slack/web-api/dist/response/ConversationsHistoryResponse";

export async function slackSyncThread(
  slackConfig: SlackConfig,
  dustConfig: DustConfig,
  channel_id: string,
  thread_ts: string
) {
  const client = new WebClient(slackConfig.accessToken);

  return await slackSyncThreadWithClient(
    client,
    dustConfig,
    channel_id,
    thread_ts
  );
}

export async function slackSyncThreadWithClient(
  client: WebClient,
  dustConfig: DustConfig,
  channel_id: string,
  thread_ts: string
) {
  let allMessages: Message[] = [];
  const { channel } = await client.conversations.info({
    channel: channel_id,
  });
  if (!channel) {
    throw new Error("Channel not found for id " + channel_id);
  }

  let next_cursor = undefined;

  do {
    const m = await client.conversations.replies({
      channel: channel_id,
      ts: thread_ts,
      cursor: next_cursor,
    });
    if (m.error) {
      throw new Error(m.error);
    }
    if (!m.messages) {
      break;
    }
    allMessages.concat(m.messages);
    next_cursor = m.response_metadata?.next_cursor;
  } while (next_cursor);

  upsertToDatasource(allMessages, channel, dustConfig, thread_ts);
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
    const str_from_thread = messages_from_thread?.join("\n");
    if (!str_from_thread) {
      return;
    }
  
    const documentId = `${channel.name}-${thread_ts}`;
    const dust_url = `http://localhost:3000/api/v1/data_sources/${dustConfig.username}/${dustConfig.datasourceId}/documents/${documentId}`;
    const dust_request_payload = {
      text: str_from_thread,
    };
    const dust_request_config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${dustConfig.APIKey}`,
      },
    };
    try {
      const dust_request_result = await axios.post(
        dust_url,
        dust_request_payload,
        dust_request_config
      );
      if (dust_request_result.status >= 200 && dust_request_result.status < 300) {
        console.log("successfully uploaded to do: ", dust_request_payload);
        
      }
    } catch (err: any) {
      console.error("Error uploading to dust: ", err.response.data);
    }
  }
  
