import type { CoreAPIDataSourceDocumentSection, ModelId } from "@dust-tt/types";
import { cacheWithRedis, safeSubstring } from "@dust-tt/types";
import type {
  CodedError,
  WebAPIPlatformError,
  WebClient,
} from "@slack/web-api";
import { ErrorCode } from "@slack/web-api";
import type {
  ConversationsHistoryResponse,
  MessageElement,
} from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import type {
  Channel,
  ConversationsListResponse,
} from "@slack/web-api/dist/response/ConversationsListResponse";
import PQueue from "p-queue";
import { Op, Sequelize } from "sequelize";

import {
  joinChannel,
  updateSlackChannelInConnectorsDb,
} from "@connectors/connectors/slack/lib/channels";
import { isSlackWebAPIPlatformError } from "@connectors/connectors/slack/lib/errors";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { getRepliesFromThread } from "@connectors/connectors/slack/lib/thread";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { cacheGet, cacheSet } from "@connectors/lib/cache";
import {
  deleteFromDataSource,
  renderDocumentTitleAndContent,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { ProviderWorkflowError } from "@connectors/lib/error";
import { SlackChannel, SlackMessages } from "@connectors/lib/models/slack";
import {
  reportInitialSyncProgress,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

import { getWeekEnd, getWeekStart } from "../lib/utils";

const logger = mainLogger.child({ provider: "slack" });

// This controls the maximum number of concurrent calls to syncThread and syncNonThreaded.
const MAX_CONCURRENCY_LEVEL = 2;
// Maximum number of messages we process in a single syncNonThreaded call (1 week of unthreaded
// messages). Some channels have integrations that post a lot of messages. Beyond this number (more
// that 500 messages per week), the information is very likely useless.
const MAX_SYNC_NON_THREAD_MESSAGES = 4000;

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
  connectorId: ModelId,
  joinedOnly: boolean
): Promise<Channel[]> {
  const client = await getSlackClient(connectorId);
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
      if (channel && channel.id) {
        if (channel.is_archived) {
          continue;
        }
        if (!joinedOnly || channel.is_member) {
          allChannels.push(channel);
        }
      }
    }
  } while (nextCursor);

  return allChannels;
}

export async function getChannelsToSync(connectorId: number) {
  const [remoteChannels, localChannels] = await Promise.all([
    await getChannels(connectorId, true),
    await SlackChannel.findAll({
      where: {
        connectorId: connectorId,
        permission: {
          [Op.or]: ["read", "read_write"],
        },
      },
    }),
  ]);
  const readAllowedChannels = new Set(
    localChannels.map((c) => c.slackChannelId)
  );
  return remoteChannels.filter((c) => c.id && readAllowedChannels.has(c.id));
}

export async function getChannel(
  connectorId: ModelId,
  channelId: string
): Promise<Channel> {
  const client = await getSlackClient(connectorId);
  const res = await client.conversations.info({ channel: channelId });
  // Despite the typing, in practice `conversations.info` can be undefined at times.
  if (!res) {
    throw new ProviderWorkflowError(
      "slack",
      "Received unexpected undefined replies from Slack API in getChannel (generally transient)",
      "transient_upstream_activity_error"
    );
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
  channelId: string,
  connectorId: ModelId,
  fromTs: number | null,
  weeksSynced: Record<number, boolean>,
  messagesCursor?: string
): Promise<SyncChannelRes | undefined> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const remoteChannel = await getChannel(connectorId, channelId);
  if (!remoteChannel.name) {
    throw new Error(`Could not find channel name for channel ${channelId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const channel = await updateSlackChannelInConnectorsDb({
    slackChannelId: channelId,
    slackChannelName: remoteChannel.name,
    connectorId: connectorId,
  });

  const slackConfiguration =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);

  if (!slackConfiguration) {
    throw new Error(
      `Could not find slack configuration for connector ${connectorId}`
    );
  }

  if (!["read", "read_write"].includes(channel.permission)) {
    logger.info(
      {
        connectorId,
        channelId,
        channelName: remoteChannel.name,
      },
      "Channel is not indexed, skipping"
    );
    return;
  }
  const threadsToSync: string[] = [];
  let unthreadedTimeframesToSync: number[] = [];
  const messages = await getMessagesForChannel(
    connectorId,
    channelId,
    50,
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
    if (
      !message.user &&
      !(
        message.bot_profile?.name &&
        (await slackConfiguration.isBotWhitelistedToIndexMessages(
          message.bot_profile.name
        ))
      )
    ) {
      // We do not support messages not posted by users for now, unless it's a whitelisted bot
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
            channelName: remoteChannel.name,
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
            channelName: remoteChannel.name,
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

  unthreadedTimeframesToSync = unthreadedTimeframesToSync.filter(
    (t) => !(t in weeksSynced)
  );

  logger.info(
    {
      connectorId,
      channelId,
      threadsToSyncCount: threadsToSync.length,
      unthreadedTimeframesToSyncCount: unthreadedTimeframesToSync.length,
    },
    "syncChannel.splitMessages"
  );

  await syncThreads(
    dataSourceConfig,
    channelId,
    remoteChannel.name,
    threadsToSync,
    connectorId
  );

  await syncMultipleNoNThreaded(
    dataSourceConfig,
    channelId,
    remoteChannel.name,
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
  connectorId: ModelId,
  channelId: string,
  limit = 100,
  nextCursor?: string
): Promise<ConversationsHistoryResponse> {
  const client = await getSlackClient(connectorId);

  const c: ConversationsHistoryResponse = await client.conversations.history({
    channel: channelId,
    limit: limit,
    cursor: nextCursor,
  });
  // Despite the typing, in practice `conversations.history` can be undefined at times.
  if (!c) {
    throw new ProviderWorkflowError(
      "slack",
      "Received unexpected undefined replies from Slack API in getMessagesForChannel (generally transient)",
      "transient_upstream_activity_error"
    );
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
      connectorId,
    },
    "getMessagesForChannel"
  );
  return c;
}

export async function syncMultipleNoNThreaded(
  dataSourceConfig: DataSourceConfig,
  channelId: string,
  channelName: string,
  timestampsMs: number[],
  connectorId: ModelId
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENCY_LEVEL });

  const promises = [];
  for (const startTsMs of timestampsMs) {
    const p = queue.add(() =>
      syncNonThreaded(
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
  return Promise.all(promises);
}

export async function syncNonThreaded(
  channelId: string,
  channelName: string,
  startTsMs: number,
  endTsMs: number,
  connectorId: ModelId,
  isBatchSync = false
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const slackConfiguration =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);
  if (!slackConfiguration) {
    throw new Error(
      `Could not find slack configuration for connector ${connector}`
    );
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const client = await getSlackClient(connectorId);
  const nextCursor: string | undefined = undefined;
  const messages: MessageElement[] = [];

  const startTsSec = Math.round(startTsMs / 1000);
  const endTsSec = Math.round(endTsMs / 1000);

  let hasMore: boolean | undefined = undefined;
  let latestTsSec = endTsSec;
  do {
    let c: ConversationsHistoryResponse | undefined = undefined;
    try {
      c = await client.conversations.history({
        channel: channelId,
        limit: 100,
        oldest: `${startTsSec}`,
        latest: `${latestTsSec}`,
        cursor: nextCursor,
      });
    } catch (e) {
      const maybeSlackPlatformError = e as WebAPIPlatformError;
      if (
        maybeSlackPlatformError.code === "slack_webapi_platform_error" &&
        maybeSlackPlatformError.data?.error === "not_in_channel"
      ) {
        // If the bot is no longer in the channel, we don't upsert anything.
        return;
      }

      throw e;
    }

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
      if (
        !message.user &&
        !(
          message.bot_profile?.name &&
          (await slackConfiguration.isBotWhitelistedToIndexMessages(
            message.bot_profile.name
          ))
        )
      ) {
        // We do not support messages not posted by users for now, unless it's a whitelisted bot
        continue;
      }
      if (!message.thread_ts && message.ts) {
        messages.push(message);
      }
    }
    hasMore = c.has_more;

    if (messages.length > MAX_SYNC_NON_THREAD_MESSAGES) {
      logger.warn(
        {
          messagesCount: messages.length,
          connectorId,
          channelName,
          channelId,
          startTsMs,
          endTsMs,
          latestTsSec,
          nextCursor,
        },
        "Giving up on syncNonThreaded: too many messages"
      );
      break;
    }
  } while (hasMore);

  if (messages.length === 0) {
    // no non threaded messages, so we're done
    return;
  }
  messages.reverse();

  const content = await formatMessagesForUpsert({
    dataSourceConfig,
    channelName,
    messages,
    isThread: false,
    connectorId,
    slackClient: client,
  });

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
    } else {
      logger.error(
        {
          connectorId,
          channelId,
          channelName,
          messageTs: firstMessage.ts,
          linkRes,
        },
        "No documentUrl for Slack non threaded: Failed to get permalink"
      );
    }
  }
  const lastMessage = messages.at(-1);
  const updatedAt = lastMessage?.ts
    ? parseInt(lastMessage.ts, 10) * 1000
    : undefined;

  const tags = getTagsForPage(documentId, channelId, channelName);

  await SlackMessages.upsert({
    connectorId: connectorId,
    channelId: channelId,
    messageTs: undefined,
    documentId: documentId,
  });

  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentContent: content,
    documentUrl: sourceUrl,
    timestampMs: updatedAt,
    tags,
    parents: [channelId],
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
    async: true,
  });
}

export async function syncThreads(
  dataSourceConfig: DataSourceConfig,
  channelId: string,
  channelName: string,
  threadsTs: string[],
  connectorId: ModelId
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
        channelId,
        channelName,
        threadTs,
        connectorId,
        true // isBatchSync
      );
    });
    promises.push(p);
  }
  return Promise.all(promises);
}

export async function syncThread(
  channelId: string,
  channelName: string,
  threadTs: string,
  connectorId: ModelId,
  isBatchSync = false
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const slackClient = await getSlackClient(connectorId);

  let allMessages: MessageElement[] = [];

  logger.info(
    {
      messagesCount: allMessages.length,
      channelName,
      channelId,
      threadTs,
    },
    "syncThread.getRepliesFromThread.send"
  );

  const now = new Date();

  try {
    allMessages = await getRepliesFromThread({
      slackClient,
      channelId,
      threadTs,
    });
    allMessages = allMessages.filter((m) => !!m.user);
  } catch (e) {
    const slackError = e as CodedError;
    if (slackError.code === ErrorCode.PlatformError) {
      const platformError = slackError as WebAPIPlatformError;

      if (platformError.data.error === "thread_not_found") {
        // If the thread is not found we just return and don't upsert anything.
        return;
      }

      if (
        platformError.code === "slack_webapi_platform_error" &&
        platformError.data?.error === "not_in_channel"
      ) {
        // If the bot is no longer in the channel, we don't upsert anything.
        return;
      }
    }
    throw e;
  }

  logger.info(
    {
      messagesCount: allMessages.length,
      channelName,
      channelId,
      threadTs,
      delayMs: new Date().getTime() - now.getTime(),
    },
    "syncThread.getRepliesFromThread.done"
  );

  const documentId = `slack-${channelId}-thread-${threadTs}`;

  const botUserId = await getBotUserIdMemoized(connectorId);
  allMessages = allMessages.filter((m) => m.user !== botUserId);

  if (allMessages.length === 0) {
    // No threaded messages, so we're done.
    return;
  }

  const content = await formatMessagesForUpsert({
    dataSourceConfig,
    channelName,
    messages: allMessages,
    isThread: true,
    connectorId,
    slackClient,
  });

  const firstMessage = allMessages[0];
  let sourceUrl: string | undefined = undefined;

  if (firstMessage && firstMessage.ts) {
    const linkRes = await slackClient.chat.getPermalink({
      channel: channelId,
      message_ts: firstMessage.ts,
    });
    if (linkRes.ok && linkRes.permalink) {
      sourceUrl = linkRes.permalink;
    } else {
      logger.error(
        {
          connectorId,
          channelId,
          channelName,
          threadTs,
          messageTs: firstMessage.ts,
          linkRes,
        },
        "No documentUrl for Slack thread: Failed to get permalink"
      );
    }
  }
  const lastMessage = allMessages.at(-1);
  const updatedAt = lastMessage?.ts
    ? parseInt(lastMessage.ts, 10) * 1000
    : undefined;

  const tags = getTagsForPage(documentId, channelId, channelName, threadTs);

  await SlackMessages.upsert({
    connectorId: connectorId,
    channelId: channelId,
    messageTs: threadTs,
    documentId: documentId,
  });

  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentContent: content,
    documentUrl: sourceUrl,
    timestampMs: updatedAt,
    tags,
    parents: [channelId],
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
    async: true,
  });
}

async function processMessageForMentions(
  message: string,
  connectorId: ModelId,
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

export async function formatMessagesForUpsert({
  dataSourceConfig,
  channelName,
  messages,
  isThread,
  connectorId,
  slackClient,
}: {
  dataSourceConfig: DataSourceConfig;
  channelName: string;
  messages: MessageElement[];
  isThread: boolean;
  connectorId: ModelId;
  slackClient: WebClient;
}): Promise<CoreAPIDataSourceDocumentSection> {
  const data = await Promise.all(
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

      return {
        messageDate,
        dateStr: messageDateStr,
        userName,
        text: text,
        content: text + "\n",
        sections: [],
      };
    })
  );

  const first = data.at(0);
  const last = data.at(-1);
  if (!last || !first) {
    throw new Error("Cannot format empty list of messages");
  }

  const title = isThread
    ? `Thread in #${channelName}: ${
        safeSubstring(first.text.replace(/\s+/g, " ").trim(), 0, 128) + "..."
      }`
    : `Messages in #${channelName}`;

  return renderDocumentTitleAndContent({
    dataSourceConfig,
    title,
    createdAt: first.messageDate,
    updatedAt: last.messageDate,
    content: {
      prefix: null,
      content: null,
      sections: data.map((d) => ({
        prefix: `>> @${d.userName} [${d.dateStr}]:\n`,
        content: d.text + "\n",
        sections: [],
      })),
    },
  });
}

export async function fetchUsers(connectorId: ModelId) {
  let cursor: string | undefined;
  const client = await getSlackClient(connectorId);
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

export async function getBotUserId(connectorId: ModelId): Promise<string> {
  let client: WebClient | undefined = undefined;

  client = await getSlackClient(connectorId);

  const authRes = await client.auth.test({});
  if (authRes.error) {
    throw new Error(`Failed to fetch auth info: ${authRes.error}`);
  }
  if (!authRes.user_id) {
    throw new Error(`Failed to fetch auth info: user_id is undefined`);
  }

  return authRes.user_id;
}

export const getBotUserIdMemoized = cacheWithRedis(
  getBotUserId,
  (id) => id.toString(),
  60 * 10 * 1000
);

export async function saveSuccessSyncActivity(connectorId: ModelId) {
  logger.info(
    {
      connectorId,
    },
    "Saving success sync activity for connector"
  );
  await syncSucceeded(connectorId);
}

export async function reportInitialSyncProgressActivity(
  connectorId: ModelId,
  progress: string
) {
  await reportInitialSyncProgress(connectorId, progress);
}

export async function getUserName(
  slackUserId: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string | undefined> {
  const fromCache = await cacheGet(getUserCacheKey(slackUserId, connectorId));
  if (fromCache) {
    return fromCache;
  }

  try {
    const info = await slackClient.users.info({ user: slackUserId });

    if (info && info.user) {
      const displayName = info.user.profile?.display_name;
      const realName = info.user.profile?.real_name;
      const userName = displayName || realName || info.user.name;

      if (userName) {
        await cacheSet(getUserCacheKey(slackUserId, connectorId), userName);
        return info.user.name;
      }
    }

    return undefined;
  } catch (err) {
    if (isSlackWebAPIPlatformError(err)) {
      if (err.data.error === "user_not_found") {
        logger.info({ connectorId, slackUserId }, "Slack user not found.");

        return undefined;
      }
    }

    throw err;
  }
}

function getUserCacheKey(userId: string, connectorId: ModelId) {
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
  connectorId: ModelId
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
    (await getChannels(connectorId, true))
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

export async function deleteChannel(channelId: string, connectorId: ModelId) {
  const maxMessages = 1000;
  let nbDeleted = 0;

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Could not find connector ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
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
  connectorId: ModelId
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

export async function attemptChannelJoinActivity(
  connectorId: ModelId,
  channelId: string
) {
  const res = await joinChannel(connectorId, channelId);

  if (res.isErr()) {
    throw res.error;
  }

  const { channel, result } = res.value;
  if (result === "is_archived") {
    logger.info(
      {
        channel,
        connectorId,
      },
      "Channel is archived, skipping sync."
    );
    return false;
  }

  return true;
}
