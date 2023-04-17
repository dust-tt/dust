import { WebClient } from "@slack/web-api";
import {
  ConversationsListResponse,
  Channel,
  
} from "@slack/web-api/dist/response/ConversationsListResponse";
import { ConversationsHistoryResponse, Message } from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import axios, { AxiosRequestConfig } from "axios";

import { SlackConfig, DustConfig } from "./interface";
import {slackSyncThread, slackSyncThreadWithClient} from "./sync_thread"


export async function syncAllChannels(
  slackConfig: SlackConfig,
  dustConfig: DustConfig,
  last_seen_ts?: string
) {
  const client = new WebClient(slackConfig.accessToken);
  
  let next_cursor = undefined;

  do {
    const c: ConversationsListResponse = await client.conversations.list({
      types: "public_channel,private_channel",
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
          console.log("Processing channel: ", channel.name, channel.id);
          await processChannelMessages(
            client,
            channel,
            dustConfig,
            last_seen_ts
          );
        } else {
          console.log(
            "Not processing channel because we are not a member of it.",
            channel.name,
            channel.id
          );
        }
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
  channel: Channel,
  dustConfig: DustConfig,
  last_seen_ts?: string
) {
  let next_cursor = undefined;

  do {
    const history: ConversationsHistoryResponse =
      await client.conversations.history({
        channel: channel.id!,
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
        slackSyncThreadWithClient(client, dustConfig, channel.id!, message.thread_ts);
      }
    }
  } while (next_cursor);
}


