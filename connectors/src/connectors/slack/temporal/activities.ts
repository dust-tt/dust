import type { DataSourceViewType } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import type {
  CodedError,
  WebAPIPlatformError,
  WebClient,
} from "@slack/web-api";
import { ErrorCode } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/types/response/ChannelsInfoResponse";
import type {
  ConversationsHistoryResponse,
  MessageElement,
} from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";
import assert from "assert";
import { Op, Sequelize } from "sequelize";

import {
  getBotUserIdMemoized,
  getUserCacheKey,
  shouldIndexSlackMessage,
} from "@connectors/connectors/slack/lib/bot_user_helpers";
import {
  getChannelById,
  getJoinedChannels,
  joinChannel,
  migrateChannelsFromLegacyBotToNewBot,
  updateSlackChannelInConnectorsDb,
  updateSlackChannelInCoreDb,
} from "@connectors/connectors/slack/lib/channels";
import { formatMessagesForUpsert } from "@connectors/connectors/slack/lib/messages";
import {
  getSlackClient,
  reportSlackUsage,
  withSlackErrorHandling,
} from "@connectors/connectors/slack/lib/slack_client";
import { getRepliesFromThread } from "@connectors/connectors/slack/lib/thread";
import {
  extractFromTags,
  getSlackChannelSourceUrl,
  getWeekEnd,
  getWeekStart,
  slackChannelInternalIdFromSlackChannelId,
  slackNonThreadedMessagesInternalIdFromSlackNonThreadedMessagesIdentifier,
  slackThreadInternalIdFromSlackThreadIdentifier,
} from "@connectors/connectors/slack/lib/utils";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { cacheSet } from "@connectors/lib/cache";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  ExternalOAuthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import { SlackChannel, SlackMessages } from "@connectors/lib/models/slack";
import {
  reportInitialSyncProgress,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import { heartbeat } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig, SlackAutoReadPattern } from "@connectors/types";
import {
  concurrentExecutor,
  INTERNAL_MIME_TYPES,
  normalizeError,
  withRetries,
} from "@connectors/types";

const logger = mainLogger.child({ provider: "slack" });

// This controls the maximum number of concurrent calls to syncThread and syncNonThreaded.
const MAX_CONCURRENCY_LEVEL = 8;

const CONVERSATION_HISTORY_LIMIT = 100;

// Maximum number of messages we process in a single syncNonThreaded call (1 week of unthreaded
// messages). Some channels have integrations that post a lot of messages. Beyond this number (more
// that 1000 messages per week), the information is very likely useless.
const MAX_SYNC_NON_THREAD_MESSAGES = 1000;

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

  const slackClient = await getSlackClient(connectorId);

  const remoteChannel = await withSlackErrorHandling(() =>
    getChannelById(slackClient, connectorId, channelId)
  );
  if (!remoteChannel || !remoteChannel.name) {
    throw new Error(
      `Could not find channel or channel name for channel ${channelId}`
    );
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

  // Check if channel has a skipReason
  const slackChannel = await SlackChannel.findOne({
    where: {
      connectorId,
      slackChannelId: channelId,
    },
  });

  if (slackChannel?.skipReason) {
    logger.info(
      {
        connectorId,
        channelId,
        channelName: remoteChannel.name,
        skipReason: slackChannel.skipReason,
      },
      `Skipping channel sync: ${slackChannel.skipReason}`
    );
    return;
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

  // If the cursor is not set this is the first call to syncChannel so we upsert the associated
  // folder.
  if (!messagesCursor) {
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: slackChannelInternalIdFromSlackChannelId(channelId),
      title: `#${channel.name}`,
      parentId: null,
      parents: [slackChannelInternalIdFromSlackChannelId(channelId)],
      mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
      sourceUrl: getSlackChannelSourceUrl(channelId, slackConfiguration),
      providerVisibility: channel.private ? "private" : "public",
    });
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
    const isIndexable = await shouldIndexSlackMessage(
      slackConfiguration,
      message,
      slackClient
    );

    if (!isIndexable) {
      // Skip non-user messages unless from whitelisted bot/workflow.
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

  await syncThreads(channelId, remoteChannel.name, threadsToSync, connectorId);

  await syncMultipleNonThreaded(
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

export async function syncChannelMetadata(
  connectorId: ModelId,
  channelId: string,
  timestampsMs: number
) {
  await updateSlackChannelInCoreDb(connectorId, channelId, timestampsMs);
}

export async function getMessagesForChannel(
  connectorId: ModelId,
  channelId: string,
  limit = 100,
  nextCursor?: string
): Promise<ConversationsHistoryResponse> {
  const slackClient = await getSlackClient(connectorId);

  reportSlackUsage({
    connectorId,
    method: "conversations.history",
    channelId,
    limit,
  });
  const c: ConversationsHistoryResponse = await withSlackErrorHandling(() =>
    slackClient.conversations.history({
      channel: channelId,
      limit: limit,
      cursor: nextCursor,
    })
  );
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

export async function syncNonThreaded({
  channelId,
  channelName,
  connectorId,
  endTsMs,
  isBatchSync = false,
  startTsMs,
}: {
  channelId: string;
  channelName: string;
  connectorId: ModelId;
  endTsMs: number;
  isBatchSync?: boolean;
  startTsMs: number;
}) {
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

  const messages: MessageElement[] = [];

  const startTsSec = Math.round(startTsMs / 1000);
  const endTsSec = Math.round(endTsMs / 1000);

  const startDate = new Date(startTsMs);
  const endDate = new Date(endTsMs);

  // IMPORTANT: Document ID generation relies on weekly start/end dates, not chunk boundaries.
  // This ensures all chunks processing the same week contribute to the same document.
  const documentId =
    slackNonThreadedMessagesInternalIdFromSlackNonThreadedMessagesIdentifier({
      channelId,
      startDate,
      endDate,
    });

  // Retrieve the SlackMessage if it exists to skip sync if done already in the last hour + enforce
  // skipReason
  let [existingMessage] = await SlackMessages.findAll({
    where: {
      channelId,
      connectorId,
      documentId,
    },
    order: [["id", "ASC"]],
    limit: 1,
  });

  if (existingMessage) {
    // If skipReason skip.
    if (existingMessage.skipReason) {
      logger.info(
        {
          connectorId,
          channelId,
          channelName,
          skipReason: existingMessage.skipReason,
        },
        `Skipping non-thread sync: ${existingMessage.skipReason}`
      );
      return;
    }

    // If updated in last hour, skip.
    if (existingMessage.updatedAt.getTime() > Date.now() - 60 * 60 * 1000) {
      logger.info(
        {
          connectorId,
          channelId,
          channelName,
          updatedAt: existingMessage.updatedAt,
        },
        "Skipping non-thread sync: already updated in the last hour"
      );
      return;
    }
  }

  const slackClient = await getSlackClient(connectorId);

  let hasMore: boolean | undefined = undefined;
  let latestTsSec = endTsSec;
  const seenMessagesTs = new Set<string>();
  do {
    let c: ConversationsHistoryResponse | undefined = undefined;
    try {
      reportSlackUsage({
        connectorId,
        method: "conversations.history",
        channelId,
        useCase: isBatchSync ? "batch_sync" : "incremental_sync",
      });

      c = await withSlackErrorHandling(() =>
        slackClient.conversations.history({
          channel: channelId,
          limit: CONVERSATION_HISTORY_LIMIT,
          oldest: `${startTsSec}`,
          latest: `${latestTsSec}`,
          inclusive: true,
        })
      );
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

    if (c?.error) {
      throw new Error(
        `Failed getting messages for channel ${channelId}: ${c.error}`
      );
    }
    if (c?.messages === undefined) {
      logger.error(
        {
          channelId,
          channelName,
          connectorId,
          error: c.error,
          oldest: startTsSec,
          latest: latestTsSec,
        },
        "Failed getting messages for channel"
      );
      throw new Error(
        `Failed getting messages for channel ${channelId}: messages is undefined`
      );
    }

    await heartbeat();

    for (const message of c.messages) {
      if (message.ts) {
        latestTsSec = parseInt(message.ts);
      }
      const isIndexable = await shouldIndexSlackMessage(
        slackConfiguration,
        message,
        slackClient
      );

      if (!isIndexable) {
        // Skip non-user messages unless from whitelisted bot/workflow.
        continue;
      }
      if (!message.thread_ts && message.ts && !seenMessagesTs.has(message.ts)) {
        seenMessagesTs.add(message.ts);
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
        },
        "Giving up on syncNonThreaded: too many messages"
      );
      break;
    }
  } while (hasMore);

  await processAndUpsertNonThreadedMessages({
    channelId,
    channelName,
    connectorId,
    dataSourceConfig,
    isBatchSync,
    messages,
    slackClient,
    documentId,
  });

  // Reload existingMessage in case it was created since then to decide if we need to create or
  // update it.
  [existingMessage] = await SlackMessages.findAll({
    where: {
      channelId,
      connectorId,
      documentId,
    },
    order: [["id", "ASC"]],
    limit: 1,
  });

  if (!existingMessage) {
    await SlackMessages.create({
      connectorId,
      channelId,
      messageTs: undefined,
      documentId,
    });
  } else {
    // We update updatedAt to avoid re-syncing the thread for the next hour (see earlier in the
    // activity). updatedAt is not directly updatable with Sequelize but this will do it.
    existingMessage.changed("updatedAt", true);
    await existingMessage.save();
  }
}

async function processAndUpsertNonThreadedMessages({
  channelId,
  channelName,
  connectorId,
  dataSourceConfig,
  isBatchSync,
  messages,
  slackClient,
  documentId,
}: {
  channelId: string;
  channelName: string;
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  isBatchSync: boolean;
  messages: MessageElement[];
  slackClient: WebClient;
  documentId: string;
}) {
  if (messages.length === 0) {
    return;
  }

  messages.reverse();

  const content = await withSlackErrorHandling(() =>
    formatMessagesForUpsert({
      dataSourceConfig,
      channelName,
      messages,
      isThread: false,
      connectorId,
      slackClient,
    })
  );

  const firstMessage = messages[0];
  let sourceUrl: string | undefined = undefined;

  if (firstMessage && firstMessage.ts) {
    const { ts } = firstMessage;

    reportSlackUsage({
      connectorId,
      method: "chat.getPermalink",
      channelId,
    });
    const linkRes = await withSlackErrorHandling(() =>
      slackClient.chat.getPermalink({
        channel: channelId,
        message_ts: ts,
      })
    );
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

  const tags = getTagsForPage({
    channelId,
    channelName,
    createdAt: messages[0]?.ts
      ? new Date(parseInt(messages[0].ts, 10) * 1000)
      : new Date(),
    documentId,
  });

  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent: content,
    documentUrl: sourceUrl,
    timestampMs: updatedAt,
    tags,
    parentId: slackChannelInternalIdFromSlackChannelId(channelId),
    parents: [documentId, slackChannelInternalIdFromSlackChannelId(channelId)],
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
    title: extractFromTags({
      tagPrefix: "title:",
      tags,
    }),
    mimeType: INTERNAL_MIME_TYPES.SLACK.MESSAGES,
    async: true,
  });
}

async function syncMultipleNonThreaded(
  channelId: string,
  channelName: string,
  timestampsMs: number[],
  connectorId: ModelId
) {
  await concurrentExecutor(
    timestampsMs,
    async (startTsMs) => {
      const weekEndTsMs = getWeekEnd(new Date(startTsMs)).getTime();

      return syncNonThreaded({
        channelId,
        channelName,
        startTsMs,
        endTsMs: weekEndTsMs,
        connectorId,
        isBatchSync: true,
      });
    },
    { concurrency: MAX_CONCURRENCY_LEVEL }
  );
}

async function syncThreads(
  channelId: string,
  channelName: string,
  threadsTs: string[],
  connectorId: ModelId
) {
  await concurrentExecutor(
    threadsTs,
    async (threadTs) => {
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

      if (channel.skipReason) {
        logger.info(
          {
            connectorId,
            channelId,
            channelName,
            skipReason: channel.skipReason,
          },
          `Skipping thread sync: ${channel.skipReason}`
        );
        return;
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
    },
    {
      concurrency: MAX_CONCURRENCY_LEVEL,
      onBatchComplete: async () => {
        await heartbeat();
      },
    }
  );
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
    allMessages = await withSlackErrorHandling(() =>
      getRepliesFromThread({
        connectorId,
        slackClient,
        channelId,
        threadTs,
        useCase: isBatchSync ? "batch_sync" : "incremental_sync",
      })
    );
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

  const documentId = slackThreadInternalIdFromSlackThreadIdentifier({
    channelId,
    threadTs,
  });

  const botUserId = await withSlackErrorHandling(() =>
    getBotUserIdMemoized(slackClient, connectorId)
  );
  allMessages = allMessages.filter((m) => m.user !== botUserId);

  if (allMessages.length === 0) {
    // No threaded messages, so we're done.
    return;
  }

  const content = await withSlackErrorHandling(() =>
    formatMessagesForUpsert({
      dataSourceConfig,
      channelName,
      messages: allMessages,
      isThread: true,
      connectorId,
      slackClient,
    })
  );

  const firstMessage = allMessages[0];
  let sourceUrl: string | undefined = undefined;

  if (firstMessage && firstMessage.ts) {
    const { ts } = firstMessage;

    reportSlackUsage({
      connectorId,
      method: "chat.getPermalink",
      channelId,
    });
    const linkRes = await withSlackErrorHandling(() =>
      slackClient.chat.getPermalink({
        channel: channelId,
        message_ts: ts,
      })
    );
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

  const tags = getTagsForPage({
    channelId,
    channelName,
    createdAt: allMessages[0]?.ts
      ? new Date(parseInt(allMessages[0].ts, 10) * 1000)
      : new Date(),
    documentId,
    threadTs,
  });

  const firstMessageObject = await SlackMessages.findOne({
    where: {
      connectorId: connectorId,
      channelId: channelId,
      messageTs: threadTs,
    },
  });
  if (firstMessageObject && firstMessageObject.skipReason) {
    logger.info(
      {
        connectorId,
        channelId,
        threadTs,
        skipReason: firstMessageObject.skipReason,
      },
      `Skipping thread : ${firstMessageObject.skipReason}`
    );
    return;
  }

  // Only create the document if it doesn't already exist based on the documentId
  const existingMessages = await SlackMessages.findAll({
    where: {
      connectorId: connectorId,
      channelId: channelId,
      documentId: documentId,
    },
    order: [["id", "ASC"]],
    limit: 1,
  });
  if (existingMessages[0]) {
    await existingMessages[0].update({
      messageTs: threadTs,
    });
  } else {
    await SlackMessages.create({
      connectorId: connectorId,
      channelId: channelId,
      messageTs: threadTs,
      documentId: documentId,
    });
  }

  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent: content,
    documentUrl: sourceUrl,
    timestampMs: updatedAt,
    tags,
    parentId: slackChannelInternalIdFromSlackChannelId(channelId),
    parents: [documentId, slackChannelInternalIdFromSlackChannelId(channelId)],
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
    title:
      tags
        .find((t) => t.startsWith("title:"))
        ?.split(":")
        .slice(1)
        .join(":") ?? "",
    mimeType: INTERNAL_MIME_TYPES.SLACK.THREAD,
    async: true,
  });
}

export async function fetchUsers(connectorId: ModelId) {
  let cursor: string | undefined;
  const slackClient = await getSlackClient(connectorId);
  do {
    reportSlackUsage({
      connectorId,
      method: "users.list",
      limit: 100,
    });
    const res = await withSlackErrorHandling(() =>
      slackClient.users.list({
        cursor: cursor,
        limit: 100,
      })
    );
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

export async function getChannel(
  connectorId: ModelId,
  channelId: string
): Promise<Channel> {
  const slackClient = await getSlackClient(connectorId);

  return withSlackErrorHandling(() =>
    getChannelById(slackClient, connectorId, channelId)
  );
}

function getTagsForPage({
  channelId,
  channelName,
  createdAt,
  documentId,
  threadTs,
}: {
  channelId: string;
  channelName: string;
  createdAt: Date;
  documentId: string;
  threadTs?: string;
}): string[] {
  const tags: string[] = [
    `channelId:${channelId}`,
    `channelName:${channelName}`,
    `createdAt:${createdAt.getTime()}`,
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
      .filter(
        (c) =>
          !["read", "read_write"].includes(c.permission) ||
          c.skipReason !== null
      )
      .map((c) => c.slackChannelId)
  );

  const slackClient = await getSlackClient(connectorId);

  const remoteChannels = new Set(
    (
      await withSlackErrorHandling(() =>
        getJoinedChannels(slackClient, connectorId)
      )
    )
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
  const loggerArgs = { channelId, connectorId };
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
    logger.info(
      {
        nbMessages: slackMessages.length,
        ...loggerArgs,
      },
      `Deleting ${slackMessages.length} messages from channel ${channelId}.`
    );
    for (const slackMessage of slackMessages) {
      // We delete from the remote datasource first because we would rather double delete remotely
      // than miss one.
      await deleteDataSourceDocument(
        dataSourceConfig,
        slackMessage.documentId,
        loggerArgs
      );
      nbDeleted++;

      if (nbDeleted % 50 === 0) {
        await heartbeat();
      }
    }

    // Batch delete after we deleted from the remote datasource
    await SlackMessages.destroy({
      where: {
        channelId: channelId,
        connectorId: connectorId,
        id: slackMessages.map((s) => s.id),
      },
    });
  } while (slackMessages.length === maxMessages);

  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: slackChannelInternalIdFromSlackChannelId(channelId),
    loggerArgs,
  });

  logger.info(
    { nbDeleted, ...loggerArgs },
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

export async function migrateChannelsFromLegacyBotToNewBotActivity(
  slackConnectorId: ModelId,
  slackBotConnectorId: ModelId
) {
  const slackConnector = await ConnectorResource.fetchById(slackConnectorId);
  assert(slackConnector, "Slack connector not found");

  const slackBotConnector =
    await ConnectorResource.fetchById(slackBotConnectorId);
  assert(slackBotConnector, "Slack bot connector not found");

  // Only run this activity if the legacy bot is not enabled anymore and new bot is enabled.
  const slackConfiguration =
    await SlackConfigurationResource.fetchByConnectorId(slackConnector.id);
  assert(slackConfiguration, "Slack configuration not found");

  // If enabled, we don't need to migrate.
  if (slackConfiguration.botEnabled) {
    return;
  }

  const slackBotConfiguration =
    await SlackConfigurationResource.fetchByConnectorId(slackBotConnector.id);
  assert(slackBotConfiguration, "Slack bot configuration not found");

  // If not enabled, we don't need to migrate.
  if (!slackBotConfiguration.botEnabled) {
    return;
  }

  try {
    await migrateChannelsFromLegacyBotToNewBot(
      slackConnector,
      slackBotConnector
    );
  } catch (e) {
    if (e instanceof ExternalOAuthTokenError) {
      logger.info(
        { error: e, slackConnectorId, slackBotConnectorId },
        "Skipping migration of channels from legacy bot to new bot: external oauth token error"
      );

      return;
    }

    throw e;
  }
}

export async function autoReadChannelActivity(
  connectorId: ModelId,
  channelId: string
): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const slackConfiguration =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);
  if (!slackConfiguration) {
    throw new Error(
      `Slack configuration not found for connector ${connectorId}`
    );
  }

  const slackClient = await getSlackClient(connectorId);

  reportSlackUsage({
    connectorId,
    method: "conversations.info",
    channelId,
  });

  const remoteChannel = await slackClient.conversations.info({
    channel: channelId,
  });

  const channelName = remoteChannel.channel?.name;
  const isPrivate = remoteChannel.channel?.is_private ?? false;

  if (!remoteChannel.ok || !channelName) {
    logger.error({
      connectorId,
      channelId,
      error: remoteChannel.error,
    });
    throw new Error("Could not get the Slack channel information.");
  }

  const { autoReadChannelPatterns } = slackConfiguration;
  const matchingPatterns = autoReadChannelPatterns.filter((pattern) => {
    const regex = new RegExp(`^${pattern.pattern}$`);
    return regex.test(channelName);
  });

  if (matchingPatterns.length === 0) {
    return;
  }

  const provider = connector.type as "slack" | "slack_bot";
  let channel = await SlackChannel.findOne({
    where: {
      slackChannelId: channelId,
      connectorId,
    },
  });

  if (!channel) {
    channel = await SlackChannel.create({
      connectorId,
      slackChannelId: channelId,
      slackChannelName: channelName,
      permission: "read_write",
      private: isPrivate,
    });
  } else {
    await channel.update({
      permission: "read_write",
    });
  }

  // For slack_bot context, only do the basic channel setup without data source operations
  if (provider === "slack_bot") {
    return;
  }

  // Slack context: perform full data source operations
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: slackChannelInternalIdFromSlackChannelId(channelId),
    title: `#${channelName}`,
    parentId: null,
    parents: [slackChannelInternalIdFromSlackChannelId(channelId)],
    mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
    sourceUrl: getSlackChannelSourceUrl(channelId, slackConfiguration),
    providerVisibility: isPrivate ? "private" : "public",
  });

  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    {
      workspaceId: connector.workspaceId,
      apiKey: connector.workspaceAPIKey,
    },
    mainLogger.child({ provider: "slack" })
  );

  const results = await concurrentExecutor(
    matchingPatterns,
    async (p: SlackAutoReadPattern) => {
      const searchParams = new URLSearchParams({
        vaultId: p.spaceId,
        dataSourceId: connector.dataSourceId,
      });

      const searchRes = await dustAPI.searchDataSourceViews(searchParams);
      if (searchRes.isErr()) {
        mainLogger.error({
          connectorId,
          channelId,
          error: searchRes.error.message,
        });
        return new Err(new Error("Failed to join Slack channel in Dust."));
      }

      const [dataSourceView] = searchRes.value;
      if (!dataSourceView) {
        mainLogger.error({
          connectorId,
          channelId,
          error:
            "Failed to join Slack channel, there was an issue retrieving dataSourceViews",
        });
        return new Err(
          new Error("There was an issue retrieving dataSourceViews")
        );
      }

      // Retry if the patch operation fails - it can happen if the channel is not in ES yet
      try {
        await withRetries(
          mainLogger.child({ provider: "slack" }),
          async (dataSourceView: DataSourceViewType) => {
            const updateDataSourceViewRes = await dustAPI.patchDataSourceView(
              dataSourceView,
              {
                parentsToAdd: [
                  slackChannelInternalIdFromSlackChannelId(channelId),
                ],
                parentsToRemove: undefined,
              }
            );

            if (updateDataSourceViewRes.isErr()) {
              throw new Error(
                `Failed to update Slack data source view for space ${p.spaceId}.`
              );
            }
          },
          {
            retries: 3,
            delayBetweenRetriesMs: 5000,
          }
        )(dataSourceView);
      } catch (e) {
        return new Err(normalizeError(e));
      }

      return new Ok(true);
    },
    { concurrency: 5 }
  );

  const firstError = results.find((r) => r.isErr());
  if (firstError && firstError.isErr()) {
    throw firstError.error;
  }
}
