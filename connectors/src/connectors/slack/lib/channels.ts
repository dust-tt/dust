import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/types/response/ConversationsInfoResponse";
import assert from "assert";
import { Op } from "sequelize";

import { isSlackWebAPIPlatformError } from "@connectors/connectors/slack/lib/errors";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ProviderWorkflowError } from "@connectors/lib/error";
import { SlackChannel } from "@connectors/lib/models/slack";
import { heartbeat } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ConnectorPermission, ModelId } from "@connectors/types";
import {
  cacheWithRedis,
  INTERNAL_MIME_TYPES,
  normalizeError,
  withRetries,
} from "@connectors/types";

import {
  getSlackClient,
  reportSlackUsage,
  withSlackErrorHandling,
} from "./slack_client";

export type SlackChannelType = {
  id: number;
  connectorId: number;

  name: string;
  slackId: string;
  permission: ConnectorPermission;
  agentConfigurationId: string | null;
  private: boolean;
};

export async function updateSlackChannelInConnectorsDb({
  slackChannelId,
  slackChannelName,
  connectorId,
  createIfNotExistsWithParams,
}: {
  slackChannelId: string;
  slackChannelName: string;
  connectorId: number;
  createIfNotExistsWithParams?: {
    permission: ConnectorPermission;
    private: boolean;
  };
}): Promise<SlackChannelType> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Could not find connector ${connectorId}`);
  }

  let channel = await SlackChannel.findOne({
    where: {
      connectorId,
      slackChannelId,
    },
  });

  if (!channel) {
    if (createIfNotExistsWithParams) {
      channel = await SlackChannel.create({
        connectorId,
        slackChannelId,
        slackChannelName,
        permission: createIfNotExistsWithParams.permission,
        private: createIfNotExistsWithParams.private,
      });
    } else {
      throw new Error(
        `Could not find channel: connectorId=${connectorId} slackChannelId=${slackChannelId}`
      );
    }
  } else {
    if (channel.slackChannelName !== slackChannelName) {
      channel = await channel.update({
        slackChannelName,
      });
    }
  }

  return {
    id: channel.id,
    connectorId: channel.connectorId,
    name: channel.slackChannelName,
    slackId: channel.slackChannelId,
    permission: channel.permission,
    agentConfigurationId: channel.agentConfigurationId,
    private: channel.private,
  };
}

export async function updateSlackChannelInCoreDb(
  connectorId: ModelId,
  channelId: string,
  timestampMs: number | undefined
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

  const channelOnDb = await SlackChannel.findOne({
    where: {
      connectorId: connector.id,
      slackChannelId: channelId,
    },
  });
  if (!channelOnDb) {
    logger.warn(
      {
        connectorId,
        channelId,
      },
      "Could not find channel in connectors db, skipping for now."
    );
    return;
  }

  const folderId = slackChannelInternalIdFromSlackChannelId(channelId);

  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId,
    title: `#${channelOnDb.slackChannelName}`,
    parentId: null,
    parents: [folderId],
    mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
    sourceUrl: getSlackChannelSourceUrl(channelId, slackConfiguration),
    providerVisibility: channelOnDb.private ? "private" : "public",
    timestampMs,
  });
}

export async function joinChannel(
  connectorId: ModelId,
  channelId: string
): Promise<
  Result<
    { result: "ok" | "already_joined" | "is_archived"; channel: Channel },
    Error
  >
> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const client = await getSlackClient(connector.id);
  try {
    reportSlackUsage({
      connectorId,
      method: "conversations.info",
      channelId,
    });
    const channelInfo = await client.conversations.info({ channel: channelId });
    if (!channelInfo.ok || !channelInfo.channel?.name) {
      return new Err(new Error("Could not get the Slack channel information."));
    }
    if (!channelInfo.channel) {
      return new Err(new Error("Channel not found."));
    }
    if (channelInfo.channel?.is_member) {
      return new Ok({ result: "already_joined", channel: channelInfo.channel });
    }
    if (channelInfo.channel?.is_archived) {
      return new Ok({ result: "is_archived", channel: channelInfo.channel });
    }

    reportSlackUsage({
      connectorId,
      method: "conversations.join",
      channelId,
    });
    const joinRes = await client.conversations.join({ channel: channelId });
    if (joinRes.ok) {
      return new Ok({ result: "ok", channel: channelInfo.channel });
    } else {
      return new Ok({ result: "already_joined", channel: channelInfo.channel });
    }
  } catch (e) {
    if (isSlackWebAPIPlatformError(e)) {
      if (e.data.error === "missing_scope") {
        logger.error(
          {
            channelId,
            connectorId,
            error: e,
          },
          "Slack can't join the channel. Missing scope."
        );
        return new Err(
          new Error(
            `@Dust could not join the channel ${channelId} because of a missing scope. Please re-authorize your Slack connection and try again.`
          )
        );
      }
      if (e.data.error === "ratelimited") {
        logger.error(
          {
            connectorId,
            channelId,
            error: e,
          },
          "Slack can't join the channel. Rate limit exceeded."
        );
        return new Err(
          new Error(
            `@Dust could not join the channel ${channelId} because of a rate limit exceeded. Please try again in a few minutes.`
          )
        );
      }
      logger.error(
        {
          connectorId,
          channelId,
          error: e,
        },
        `Slack can't join the channel. Unknown Slack API Platform error.`
      );

      return new Err(e);
    }

    logger.error(
      {
        connectorId,
        channelId,
        error: e,
      },
      "Slack can't join the channel. Unknown error."
    );

    return new Err(new Error(`Can't join the channel`));
  }
}

export async function joinChannelWithRetries(
  connectorId: ModelId,
  slackChannelId: string
): Promise<
  Result<
    { result: "ok" | "already_joined" | "is_archived"; channel: Channel },
    Error
  >
> {
  try {
    return await withRetries(
      logger,
      async (connectorId: ModelId, slackChannelId: string) => {
        const result = await joinChannel(connectorId, slackChannelId);
        if (result.isErr()) {
          // Retry on any error, not just rate limit errors
          throw result.error; // This will trigger a retry
        }
        return result;
      },
      {
        retries: 3,
        delayBetweenRetriesMs: 10000, // 10 seconds between retries
      }
    )(connectorId, slackChannelId);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/**
 * Slack API rate limit TLDR:
 * Slack has different rate limits for different endpoints.
 * Broadly, you'll encounter limits like these, applied on a
 * "per API method per app per workspace" basis.
 * Tier 1: ~1 request per minute
 * Tier 2: ~20 request per minute (conversations.history, conversation.list)
 * Tier 3: ~50 request per minute (conversations.replies)
 */

/**
 *  Call cache to avoid rate limits
 *  ON RATE LIMIT ERRORS PERTAINING TO THIS FUNCTION:
 * - the next step will be to paginate (overkill at time of writing)
 * - see issue https://github.com/dust-tt/tasks/issues/1655
 * - and related PR https://github.com/dust-tt/dust/pull/8709
 * @param connectorId
 * @param joinedOnly
 */
export const getChannels = cacheWithRedis(
  _getChannelsUncached,
  (slackClient, connectorId, joinedOnly) =>
    `slack-channels-${connectorId}-${joinedOnly}`,
  {
    ttlMs: 5 * 60 * 1000,
  }
);

/**
 * Fetch channels that the bot is a member of using users.conversations API.
 * This is more efficient than getChannels for bot connectors as it only fetches
 * channels the bot has joined, avoiding rate limits from fetching all workspace channels.
 *
 * @param slackClient
 * @param connectorId
 * @returns Promise<Channel[]> Array of channels the bot is a member of
 */
export const getJoinedChannels = cacheWithRedis(
  _getJoinedChannelsUncached,
  (slackClient, connectorId) => `slack-joined-channels-${connectorId}`,
  {
    ttlMs: 5 * 60 * 1000,
  }
);

export async function getAllChannels(
  slackClient: WebClient,
  connectorId: ModelId
): Promise<Channel[]> {
  return getChannels(slackClient, connectorId, false);
}

async function _getJoinedChannelsUncached(
  slackClient: WebClient,
  connectorId: ModelId
): Promise<Channel[]> {
  const allChannels = [];
  let nextCursor: string | undefined = undefined;
  let nbCalls = 0;

  do {
    reportSlackUsage({
      connectorId,
      method: "users.conversations",
      useCase: "bot",
    });

    const response = await withSlackErrorHandling(() =>
      slackClient.users.conversations({
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 999, // Maximum allowed by Slack API
        cursor: nextCursor,
      })
    );

    nbCalls++;

    logger.info(
      {
        connectorId,
        returnedChannels: allChannels.length,
        currentCursor: nextCursor,
        nbCalls,
      },
      `[Slack] users.conversations called for getJoinedChannels (${nbCalls} calls)`
    );

    nextCursor = response?.response_metadata?.next_cursor;

    if (response.error) {
      throw new Error(`Failed to fetch joined channels: ${response.error}`);
    }

    if (response.channels === undefined) {
      throw new Error(
        "The channels list was undefined." +
          response?.response_metadata?.next_cursor +
          ""
      );
    }

    for (const channel of response.channels) {
      if (channel && channel.id) {
        allChannels.push(channel);
      }
    }
  } while (nextCursor);

  return allChannels;
}

async function _getChannelsUncached(
  slackClient: WebClient,
  connectorId: ModelId,
  joinedOnly: boolean
): Promise<Channel[]> {
  return Promise.all([
    _getTypedChannelsUncached(
      slackClient,
      connectorId,
      joinedOnly,
      "public_channel"
    ),
    _getTypedChannelsUncached(
      slackClient,
      connectorId,
      joinedOnly,
      "private_channel"
    ),
  ]).then(([publicChannels, privateChannels]) => [
    ...publicChannels,
    ...privateChannels,
  ]);
}

async function _getTypedChannelsUncached(
  slackClient: WebClient,
  connectorId: ModelId,
  joinedOnly: boolean,
  types: "public_channel" | "private_channel"
): Promise<Channel[]> {
  const allChannels = [];
  let nextCursor: string | undefined = undefined;
  let nbCalls = 0;
  do {
    reportSlackUsage({
      connectorId,
      method: "conversations.list",
      useCase: "batch_sync",
    });
    const c = await slackClient.conversations.list({
      types,
      // despite the limit being 1000, slack may return fewer channels
      // we observed ~50 channels per call at times see https://github.com/dust-tt/tasks/issues/1655
      limit: 999,
      cursor: nextCursor,
      exclude_archived: true,
    });
    nbCalls++;

    logger.info(
      {
        connectorId,
        returnedChannels: allChannels.length,
        currentCursor: nextCursor,
        nbCalls,
      },
      `[Slack] conversations.list called for getChannels (${nbCalls} calls)`
    );

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
        if (!joinedOnly || channel.is_member) {
          allChannels.push(channel);
        }
      }
    }
  } while (nextCursor);

  return allChannels;
}

export async function getChannelsToSync(
  slackClient: WebClient,
  connectorId: number
) {
  const [remoteChannels, localChannels] = await Promise.all([
    getJoinedChannels(slackClient, connectorId),
    SlackChannel.findAll({
      where: {
        connectorId,
        permission: {
          [Op.or]: ["read", "read_write"],
        },
        skipReason: null,
      },
    }),
  ]);
  const readAllowedChannels = new Set(
    localChannels.map((c) => c.slackChannelId)
  );

  return remoteChannels.filter((c) => c.id && readAllowedChannels.has(c.id));
}

export async function getChannelById(
  slackClient: WebClient,
  connectorId: ModelId,
  channelId: string
): Promise<Channel> {
  reportSlackUsage({
    connectorId,
    method: "conversations.info",
    channelId,
  });
  const res = await slackClient.conversations.info({ channel: channelId });

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

export async function migrateChannelsFromLegacyBotToNewBot(
  slackConnector: ConnectorResource,
  slackBotConnector: ConnectorResource
): Promise<Result<{ migratedChannelsCount: number }, Error>> {
  assert(
    slackConnector.type === "slack",
    "Connector must be a Slack connector"
  );
  assert(
    slackBotConnector.type === "slack_bot",
    "Connector must be a Slack bot connector"
  );

  const slackClient = await getSlackClient(slackConnector.id);

  const childLogger = logger.child({
    slackBotConnectorId: slackBotConnector.id,
    slackConnectorId: slackConnector.id,
  });

  // Fetch all channels that the deprecated bot is a member of.
  const channels = await withSlackErrorHandling(() =>
    getJoinedChannels(slackClient, slackConnector.id)
  );
  const publicChannels = channels.filter((c) => !c.is_private);

  childLogger.info(
    {
      channelsCount: channels.length,
      publicChannelsCount: publicChannels.length,
    },
    "Found channels to migrate"
  );

  for (const channel of publicChannels) {
    if (!channel.id) {
      continue;
    }

    await heartbeat();

    childLogger.info(
      {
        channelId: channel.id,
      },
      "Migrating channel"
    );

    const { id: channelId } = channel;

    // Join the new bot to the channel. Wrap with retries to handle rate limits.
    const joinRes = await joinChannelWithRetries(
      slackBotConnector.id,
      channelId
    );

    if (joinRes.isErr()) {
      childLogger.error(
        { error: joinRes.error, channelId: channel.id },
        "Could not join channel"
      );

      // Ignore the error and continue.
      continue;
    }
  }

  return new Ok({ migratedChannelsCount: channels.length });
}
