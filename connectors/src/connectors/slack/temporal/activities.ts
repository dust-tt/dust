import {
  CodedError,
  ErrorCode,
  WebAPIHTTPError,
  WebClient,
} from "@slack/web-api";
import {
  ConversationsHistoryResponse,
  Message,
} from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import {
  Channel,
  ConversationsListResponse,
} from "@slack/web-api/dist/response/ConversationsListResponse";
import { ConversationsRepliesResponse } from "@slack/web-api/dist/response/ConversationsRepliesResponse";
import memoize from "lodash.memoize";
import PQueue from "p-queue";
import { Op, Sequelize } from "sequelize";

import { upsertSlackChannelInConnectorsDb } from "@connectors/connectors/slack/lib/channels";
import { cacheGet, cacheSet } from "@connectors/lib/cache";
import {
  deleteFromDataSource,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { WorkflowError } from "@connectors/lib/error";
import { SlackChannel, SlackMessages } from "@connectors/lib/models";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import {
  reportInitialSyncProgress,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getWeekEnd, getWeekStart } from "../lib/utils";

const { NANGO_SLACK_CONNECTOR_ID } = process.env;
const logger = mainLogger.child({ provider: "slack" });

// This controls the maximum number of concurrent calls to syncThread and syncNonThreaded.
const MAX_CONCURRENCY_LEVEL = 2;

// Timeout in ms for all network requests;
const NETWORK_REQUEST_TIMEOUT_MS = 30000;

/**
 * Slack API rate limit TLDR:
 * Slack has different rate limits for different endpoints.
 * Broadly, you'll encounter limits like these, applied on a
 * "per API method per app per workspace" basis.
 * Tier 1: ~1 request per minute
 * Tier 2: ~20 request per minute (conversations.history)
 * Tier 3: ~50 request per minute (conversations.replies)
 */

export async function getChannels(
  slackAccessToken: string
): Promise<Channel[]> {
  const client = getSlackClient(slackAccessToken);
  const allChannels = [];
  let nextCursor: string | undefined = undefined;
  do {
    const c: ConversationsListResponse = await client.conversations.list({
      types: "public_channel",
      limit: 1000,
      cursor: nextCursor,
    });
    nextCursor = c?.response_metadata?.next_cursor;
    if (c.error) {
      throw new Error(c.error);
    }
    if (c.channels === undefined) {
      throw new Error(
        "The channels list was undefined." +
          c?.response_metadata?.next_cursor +
          ""
      );
    }
    for (const channel of c.channels) {
      if (channel && channel.id && channel.is_member) {
        allChannels.push(channel);
      }
    }
  } while (nextCursor);

  return allChannels;
}

export async function getChannel(
  slackAccessToken: string,
  channelId: string
): Promise<Channel> {
  const client = getSlackClient(slackAccessToken);
  const res = await client.conversations.info({ channel: channelId });
  // Despite the typing, in practice `conversations.info` can be undefined at times.
  if (!res) {
    const workflowError: WorkflowError = {
      type: "transient_upstream_activity_error",
      message:
        "Received unexpected undefined replies from Slack API in getChannel (generally transient)",
      __is_dust_error: true,
    };
    throw workflowError;
  }
  if (res.error) {
    throw new Error(res.error);
  }
  if (!res.channel) {
    throw new Error(`No channel found for id ${channelId}`);
  }

  return res.channel;
}

interface SyncChannelRes {
  nextCursor?: string;
  weeksSynced: Record<number, boolean>;
}

export async function syncChannel(
  slackAccessToken: string,
  channelId: string,
  channelName: string,
  dataSourceConfig: DataSourceConfig,
  connectorId: string,
  fromTs: number | null,
  weeksSynced: Record<number, boolean>,
  messagesCursor?: string
): Promise<SyncChannelRes | undefined> {
  const channel = await upsertSlackChannelInConnectorsDb({
    slackChannelId: channelId,
    slackChannelName: channelName,
    connectorId: parseInt(connectorId),
  });
  if (!["read", "read_write"].includes(channel.permission)) {
    logger.info(
      {
        connectorId,
        channelId,
        channelName,
      },
      "Channel is not indexed, skipping"
    );
    return;
  }
  const threadsToSync: string[] = [];
  let unthreadedTimeframesToSync: number[] = [];
  const messages = await getMessagesForChannel(
    slackAccessToken,
    channelId,
    100,
    messagesCursor
  );
  if (!messages.messages) {
    // This should never happen because we throw an exception in the activity if we get an error
    // from the Slack API, but we need to make typescript happy.
    return {
      nextCursor: messages.response_metadata?.next_cursor,
      weeksSynced: weeksSynced,
    };
  }
  // `allSkip` and `skip` logic assumes that the messages are returned in recency order (newest
  // first).
  let allSkip = true;
  for (const message of messages.messages) {
    if (!message.user) {
      // We do not support messages not posted by users for now
      continue;
    }
    let skip = false;
    if (message.thread_ts) {
      const threadTs = parseInt(message.thread_ts, 10) * 1000;
      if (fromTs && threadTs < fromTs) {
        skip = true;
        logger.info(
          {
            workspaceId: dataSourceConfig.workspaceId,
            channelId,
            channelName,
            threadTs,
            fromTs,
          },
          "FromTs Skipping thread"
        );
      }
      if (!skip && threadsToSync.indexOf(message.thread_ts) === -1) {
        // We can end up getting two messages from the same thread if a message from a thread
        // has also been "posted to channel".
        threadsToSync.push(message.thread_ts);
      }
    } else {
      const messageTs = parseInt(message.ts as string, 10) * 1000;
      const weekStartTsMs = getWeekStart(new Date(messageTs)).getTime();
      const weekEndTsMs = getWeekEnd(new Date(messageTs)).getTime();
      if (fromTs && weekEndTsMs < fromTs) {
        skip = true;
        logger.info(
          {
            workspaceId: dataSourceConfig.workspaceId,
            channelId,
            channelName,
            messageTs,
            fromTs,
            weekEndTsMs,
            weekStartTsMs,
          },
          "FromTs Skipping non-thread"
        );
      }
      if (!skip && unthreadedTimeframesToSync.indexOf(weekStartTsMs) === -1) {
        unthreadedTimeframesToSync.push(weekStartTsMs);
      }
    }
    if (!skip) {
      allSkip = false;
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

  unthreadedTimeframesToSync = unthreadedTimeframesToSync.filter(
    (t) => !(t in weeksSynced)
  );

  await syncMultipleNoNThreaded(
    slackAccessToken,
    dataSourceConfig,
    channelId,
    channelName,
    Array.from(unthreadedTimeframesToSync.values()),
    connectorId
  );
  unthreadedTimeframesToSync.forEach((t) => (weeksSynced[t] = true));

  return {
    nextCursor: allSkip ? undefined : messages.response_metadata?.next_cursor,
    weeksSynced: weeksSynced,
  };
}

export async function getMessagesForChannel(
  slackAccessToken: string,
  channelId: string,
  limit = 100,
  nextCursor?: string
): Promise<ConversationsHistoryResponse> {
  const client = getSlackClient(slackAccessToken);

  const c: ConversationsHistoryResponse = await client.conversations.history({
    channel: channelId,
    limit: limit,
    cursor: nextCursor,
  });
  // Despite the typing, in practice `conversations.history` can be undefined at times.
  if (!c) {
    const workflowError: WorkflowError = {
      type: "transient_upstream_activity_error",
      message:
        "Received unexpected undefined replies from Slack API in getMessagesForChannel (generally transient)",
      __is_dust_error: true,
    };
    throw workflowError;
  }
  if (c.error) {
    throw new Error(
      `Failed getting messages for channel ${channelId}: ${c.error}`
    );
  }

  logger.info(
    {
      messagesCount: c.messages?.length,
      channelId,
    },
    "Got messages from channel."
  );
  return c;
}

export async function syncMultipleNoNThreaded(
  slackAccessToken: string,
  dataSourceConfig: DataSourceConfig,
  channelId: string,
  channelName: string,
  timestampsMs: number[],
  connectorId: string
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENCY_LEVEL });

  const promises = [];
  for (const startTsMs of timestampsMs) {
    const p = queue.add(() =>
      syncNonThreaded(
        slackAccessToken,
        dataSourceConfig,
        channelId,
        channelName,
        startTsMs,
        getWeekEnd(new Date(startTsMs)).getTime(),
        connectorId,
        true // isBatchSync
      )
    );
    promises.push(p);
  }
  return await Promise.all(promises);
}

export async function syncNonThreaded(
  slackAccessToken: string,
  dataSourceConfig: DataSourceConfig,
  channelId: string,
  channelName: string,
  startTsMs: number,
  endTsMs: number,
  connectorId: string,
  isBatchSync = false
) {
  const client = getSlackClient(slackAccessToken);
  const nextCursor: string | undefined = undefined;
  const messages: Message[] = [];

  const startTsSec = Math.round(startTsMs / 1000);
  const endTsSec = Math.round(endTsMs / 1000);

  let hasMore: boolean | undefined = undefined;
  let latestTsSec = endTsSec;
  do {
    const c: ConversationsHistoryResponse = await client.conversations.history({
      channel: channelId,
      limit: 100,
      oldest: `${startTsSec}`,
      latest: `${latestTsSec}`,
      cursor: nextCursor,
    });

    if (c.error) {
      throw new Error(
        `Failed getting messages for channel ${channelId}: ${c.error}`
      );
    }
    if (c.messages === undefined) {
      throw new Error(
        `Failed getting messages for channel ${channelId}: messages is undefined`
      );
    }

    for (const message of c.messages) {
      if (message.ts) {
        latestTsSec = parseInt(message.ts);
      }
      if (!message.user) {
        continue;
      }
      if (!message.thread_ts && message.ts) {
        messages.push(message);
      }
    }
    hasMore = c.has_more;
  } while (hasMore);
  if (messages.length === 0) {
    // no non threaded messages, so we're done
    return;
  }
  messages.reverse();
  const text = await formatMessagesForUpsert(
    channelId,
    messages,
    connectorId,
    client
  );

  const startDate = new Date(startTsMs);
  const endDate = new Date(endTsMs);
  const startDateStr = `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`;
  const endDateStr = `${endDate.getFullYear()}-${endDate.getMonth()}-${endDate.getDate()}`;
  const documentId = `slack-${channelId}-messages-${startDateStr}-${endDateStr}`;
  const firstMessage = messages[0];
  let sourceUrl: string | undefined = undefined;

  if (firstMessage && firstMessage.ts) {
    const linkRes = await client.chat.getPermalink({
      channel: channelId,
      message_ts: firstMessage.ts,
    });
    if (linkRes.ok && linkRes.permalink) {
      sourceUrl = linkRes.permalink;
    }
  }
  const lastMessage = messages[messages.length - 1];
  const createdAt = lastMessage?.ts
    ? parseInt(lastMessage.ts, 10) * 1000
    : undefined;

  const tags = getTagsForPage(documentId, channelId, channelName);
  await SlackMessages.upsert({
    connectorId: parseInt(connectorId),
    channelId: channelId,
    messageTs: undefined,
    documentId: documentId,
  });
  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentText: text,
    documentUrl: sourceUrl,
    timestampMs: createdAt,
    tags,
    parents: [channelId],
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
  });
}

export async function syncThreads(
  dataSourceConfig: DataSourceConfig,
  slackAccessToken: string,
  channelId: string,
  channelName: string,
  threadsTs: string[],
  connectorId: string
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENCY_LEVEL });

  const promises = [];
  for (const threadTs of threadsTs) {
    const p = queue.add(async () => {
      // we first check if the bot still has read permissions on the channel
      // there could be a race condition if we are in the middle of syncing a channel but
      // the user revokes the bot's permissions
      const channel = await SlackChannel.findOne({
        where: {
          connectorId: connectorId,
          slackChannelId: channelId,
        },
      });

      if (!channel) {
        throw new Error(
          `Could not find channel ${channelId} in connectors db for connector ${connectorId}`
        );
      }

      if (!["read", "read_write"].includes(channel.permission)) {
        logger.info(
          {
            connectorId,
            channelId,
            channelName,
          },
          "Channel is not indexed, skipping"
        );
        return;
      }

      return syncThread(
        dataSourceConfig,
        slackAccessToken,
        channelId,
        channelName,
        threadTs,
        connectorId,
        true // isBatchSync
      );
    });
    promises.push(p);
  }
  return await Promise.all(promises);
}

export async function syncThread(
  dataSourceConfig: DataSourceConfig,
  slackAccessToken: string,
  channelId: string,
  channelName: string,
  threadTs: string,
  connectorId: string,
  isBatchSync = false
) {
  const client = getSlackClient(slackAccessToken);

  let allMessages: Message[] = [];

  let next_cursor = undefined;

  do {
    const replies: ConversationsRepliesResponse =
      await client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        cursor: next_cursor,
        limit: 100,
      });
    // Despite the typing, in practice `replies` can be undefined at times.
    if (!replies) {
      const workflowError: WorkflowError = {
        type: "transient_upstream_activity_error",
        message:
          "Received unexpected undefined replies from Slack API in syncThread (generally transient)",
        __is_dust_error: true,
      };
      throw workflowError;
    }
    if (replies.error) {
      throw new Error(replies.error);
    }
    if (!replies.messages) {
      break;
    }
    allMessages = allMessages.concat(replies.messages.filter((m) => !!m.user));
    next_cursor = replies.response_metadata?.next_cursor;
  } while (next_cursor);

  const botUserId = await getBotUserIdMemoized(slackAccessToken);
  allMessages = allMessages.filter((m) => m.user !== botUserId);

  const text = await formatMessagesForUpsert(
    channelId,
    allMessages,
    connectorId,
    client
  );
  const documentId = `slack-${channelId}-thread-${threadTs}`;

  const firstMessage = allMessages[0];
  let sourceUrl: string | undefined = undefined;

  if (firstMessage && firstMessage.ts) {
    const linkRes = await client.chat.getPermalink({
      channel: channelId,
      message_ts: firstMessage.ts,
    });
    if (linkRes.ok && linkRes.permalink) {
      sourceUrl = linkRes.permalink;
    }
  }
  const lastMessage = allMessages[allMessages.length - 1];
  const createdAt = lastMessage?.ts
    ? parseInt(lastMessage.ts, 10) * 1000
    : undefined;

  const tags = getTagsForPage(documentId, channelId, channelName, threadTs);

  await SlackMessages.upsert({
    connectorId: parseInt(connectorId),
    channelId: channelId,
    messageTs: threadTs,
    documentId: documentId,
  });
  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentText: text,
    documentUrl: sourceUrl,
    timestampMs: createdAt,
    tags,
    parents: [channelId],
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
  });
}

async function processMessageForMentions(
  message: string,
  connectorId: string,
  slackClient: WebClient
): Promise<string> {
  const matches = message.match(/<@[A-Z-0-9]+>/g);
  if (!matches) {
    return message;
  }
  for (const m of matches) {
    const userId = m.replace(/<|@|>/g, "");
    const userName = await getUserName(userId, connectorId, slackClient);
    if (!userName) {
      continue;
    }

    message = message.replace(m, `@${userName}`);

    continue;
  }

  return message;
}

export async function formatMessagesForUpsert(
  channelId: string,
  messages: Message[],
  connectorId: string,
  slackClient: WebClient
) {
  return (
    await Promise.all(
      messages.map(async (message) => {
        const text = await processMessageForMentions(
          message.text as string,
          connectorId,
          slackClient
        );

        const userName = await getUserName(
          message.user as string,
          connectorId,
          slackClient
        );
        const messageDate = new Date(parseInt(message.ts as string, 10) * 1000);
        const messageDateStr = formatDateForUpsert(messageDate);

        return `>> @${userName} [${messageDateStr}]:\n${text}\n`;
      })
    )
  ).join("\n");
}

export async function fetchUsers(
  slackAccessToken: string,
  connectorId: string
) {
  let cursor: string | undefined;
  const client = getSlackClient(slackAccessToken);
  do {
    const res = await client.users.list({
      cursor: cursor,
      limit: 100,
    });
    if (res.error) {
      throw new Error(`Failed to fetch users: ${res.error}`);
    }
    if (!res.members) {
      throw new Error(`Failed to fetch users: members is undefined`);
    }
    for (const member of res.members) {
      if (member.id && member.name) {
        await cacheSet(getUserCacheKey(member.id, connectorId), member.name);
      }
    }
    cursor = res.response_metadata?.next_cursor;
  } while (cursor);
}

export async function getBotUserId(
  slackAccessToken: WebClient
): Promise<string>;
export async function getBotUserId(slackAccessToken: string): Promise<string>;
export async function getBotUserId(
  slackAccessToken: string | WebClient
): Promise<string> {
  let client: WebClient | undefined = undefined;
  if (slackAccessToken instanceof WebClient) {
    client = slackAccessToken;
  } else {
    client = getSlackClient(slackAccessToken);
  }

  const authRes = await client.auth.test({});
  if (authRes.error) {
    throw new Error(`Failed to fetch auth info: ${authRes.error}`);
  }
  if (!authRes.user_id) {
    throw new Error(`Failed to fetch auth info: user_id is undefined`);
  }

  return authRes.user_id;
}

export const getBotUserIdMemoized = memoize(getBotUserId);

export async function getAccessToken(
  nangoConnectionId: string
): Promise<string> {
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
  }
  return getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_SLACK_CONNECTOR_ID,
    useCache: true,
  });
}

export async function saveSuccessSyncActivity(connectorId: string) {
  logger.info(
    {
      connectorId,
    },
    "Saving success sync activity for connector"
  );
  await syncSucceeded(parseInt(connectorId));
}

export async function reportInitialSyncProgressActivity(
  connectorId: string,
  progress: string
) {
  await reportInitialSyncProgress(parseInt(connectorId), progress);
}

export async function getUserName(
  slackUserId: string,
  connectorId: string,
  slackClient: WebClient
): Promise<string | undefined> {
  const fromCache = await cacheGet(getUserCacheKey(slackUserId, connectorId));
  if (fromCache) {
    return fromCache;
  }

  const info = await slackClient.users.info({ user: slackUserId });

  if (info && info.user?.name) {
    await cacheSet(getUserCacheKey(slackUserId, connectorId), info.user.name);
    return info.user.name;
  }
  return;
}

function getUserCacheKey(userId: string, connectorId: string) {
  return `slack-userid2name-${connectorId}-${userId}`;
}

export function formatDateForUpsert(date: Date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}${month}${day} ${hours}:${minutes}`;
}

export function getSlackClient(slackAccessToken: string): WebClient {
  const slackClient = new WebClient(slackAccessToken, {
    timeout: NETWORK_REQUEST_TIMEOUT_MS,
    retryConfig: {
      retries: 1,
      factor: 1,
    },
  });

  const handler: ProxyHandler<WebClient> = {
    get: function (target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (["function", "object"].indexOf(typeof value) > -1) {
        return new Proxy(value, handler);
      }

      return Reflect.get(target, prop, receiver);
    },
    apply: async function (target, thisArg, argumentsList) {
      try {
        // @ts-expect-error can't get typescript to be happy with this, but it works.
        return await Reflect.apply(target, thisArg, argumentsList);
      } catch (e) {
        const slackError = e as CodedError;
        if (slackError.code === ErrorCode.HTTPError) {
          const httpError = slackError as WebAPIHTTPError;
          if (httpError.statusCode === 503) {
            const workflowError: WorkflowError = {
              type: "upstream_is_down_activity_error",
              message: `Slack is down: ${httpError.message}`,
              __is_dust_error: true,
            };
            throw workflowError;
          }
        }
      }
    },
  };

  const proxied = new Proxy(slackClient, handler);

  return proxied;
}

function getTagsForPage(
  documentId: string,
  channelId: string,
  channelName: string,
  threadTs?: string
): string[] {
  const tags: string[] = [
    `channelId:${channelId}`,
    `channelName:${channelName}`,
  ];
  if (threadTs) {
    tags.push(`threadId:${threadTs}`);
    const threadDate = new Date(parseInt(threadTs) * 1000);
    const dateForTitle = formatDateForThreadTitle(threadDate);
    tags.push(`title:${channelName}-thread-${dateForTitle}`);
  } else {
    // replace `slack-${channelId}` by `${channelName}` in documentId (to have a human readable
    // title with non-threaded time boundaries present in the documentId, but the channelName
    // instead of the channelId).
    const parts = documentId.split("-").slice(1);
    parts[0] = channelName;
    const title = parts.join("-");
    tags.push(`title:${title}`);
  }
  return tags;
}

export function formatDateForThreadTitle(date: Date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day}_${hours}h${minutes}`;
}

export async function getChannelsToGarbageCollect(
  slackAccessToken: string,
  connectorId: string
): Promise<{
  // either no longer visible to the integration, or bot no longer has read permission on
  channelsToDeleteFromDataSource: string[];
  // no longer visible to the integration (subset of channelsToDeleteFromDatasource)
  channelsToDeleteFromConnectorsDb: string[];
}> {
  const channelsInConnectorsDb = await SlackChannel.findAll({
    where: {
      connectorId: connectorId,
    },
  });
  const channelIdsWithoutReadPermission = new Set(
    channelsInConnectorsDb
      .filter((c) => !["read", "read_write"].includes(c.permission))
      .map((c) => c.slackChannelId)
  );

  const remoteChannels = new Set(
    (await getChannels(slackAccessToken))
      .filter((c) => c.id)
      .map((c) => c.id as string)
  );

  const localChannels = await SlackMessages.findAll({
    attributes: [
      [Sequelize.fn("DISTINCT", Sequelize.col("channelId")), "channelId"],
    ],
    where: {
      connectorId: connectorId,
    },
  });

  const localChannelsIds = localChannels.map((c) => c.channelId);

  const channelsToDeleteFromDataSource = localChannelsIds.filter((lc) => {
    // we delete from the datasource content from channels that:
    // - are no longer visible to our integration
    // - the bot does not have read permission on
    return !remoteChannels.has(lc) || channelIdsWithoutReadPermission.has(lc);
  });
  const channelsToDeleteFromConnectorsDb = channelsInConnectorsDb
    .filter((c) => !remoteChannels.has(c.slackChannelId))
    .map((c) => c.slackChannelId);

  return {
    channelsToDeleteFromDataSource,
    channelsToDeleteFromConnectorsDb,
  };
}

export async function deleteChannel(
  channelId: string,
  dataSourceConfig: DataSourceConfig,
  connectorId: string
) {
  const maxMessages = 1000;
  let nbDeleted = 0;

  let slackMessages: SlackMessages[] = [];
  do {
    slackMessages = await SlackMessages.findAll({
      where: {
        channelId: channelId,
        connectorId: connectorId,
      },
      limit: maxMessages,
    });
    for (const slackMessage of slackMessages) {
      // We delete from the remote datasource first because we would rather double delete remotely
      // than miss one.
      await deleteFromDataSource(dataSourceConfig, slackMessage.documentId);
      await slackMessage.destroy();
      nbDeleted++;
    }
  } while (slackMessages.length === maxMessages);
  logger.info(
    { nbDeleted, channelId, connectorId },
    "Deleted documents from datasource while garbage collecting."
  );
}

export async function deleteChannelsFromConnectorDb(
  channelsToDeleteFromConnectorsDb: string[],
  connectorId: string
) {
  await SlackChannel.destroy({
    where: {
      connectorId: connectorId,
      slackChannelId: {
        [Op.in]: channelsToDeleteFromConnectorsDb,
      },
    },
  });
  logger.info(
    {
      channelsToDeleteFromConnectorsDb,
      connectorId,
    },
    "Deleted channels from connectors db while garbage collecting."
  );
}
