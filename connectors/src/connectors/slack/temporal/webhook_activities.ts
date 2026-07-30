import { onChannelCreation } from "@connectors/api/webhooks/slack/created_channel";
import { handleDeprecatedChatBot } from "@connectors/api/webhooks/slack/deprecated_bot";
import { getBotUserIdResponse } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { updateSlackChannelInConnectorsDb } from "@connectors/connectors/slack/lib/channels";
import {
  getSlackClient,
  reportSlackUsage,
  withSlackErrorHandling,
} from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import {
  launchSlackGarbageCollectWorkflow,
  launchSlackSyncOneMessageWorkflow,
  launchSlackSyncOneThreadWorkflow,
} from "@connectors/connectors/slack/temporal/client";
import type { SlackWebhookEventPayload } from "@connectors/connectors/slack/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getDustAPI } from "@connectors/lib/api/dust_api";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannelModel } from "@connectors/lib/models/slack";
import type { Logger } from "@connectors/logger/logger";
import mainLogger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { INTERNAL_MIME_TYPES, normalizeError } from "@connectors/types";
import { removeNulls } from "@dust-tt/client";
import { Op } from "sequelize";

interface SyncTarget {
  connector: ConnectorResource;
  slackConfiguration: SlackConfigurationResource;
}

/**
 * Resolves the connectors that may sync a channel: the channel must be
 * selected, readable and not skipped, and the workspace must be up.
 */
async function listSyncableConnectors(
  slackConfigurations: SlackConfigurationResource[],
  channelId: string,
  logger: Logger
): Promise<SyncTarget[]> {
  const connectors = await ConnectorResource.fetchByIds(
    "slack",
    slackConfigurations.map((c) => c.connectorId)
  );

  const slackChannels = await SlackChannelModel.findAll({
    where: {
      connectorId: { [Op.in]: connectors.map((c) => c.id) },
      slackChannelId: channelId,
    },
  });
  const channelByConnectorId = new Map(
    slackChannels.map((c) => [c.connectorId, c])
  );
  const configurationByConnectorId = new Map(
    slackConfigurations.map((c) => [c.connectorId, c])
  );

  const candidates: SyncTarget[] = [];
  for (const connector of connectors) {
    const slackConfiguration = configurationByConnectorId.get(connector.id);
    if (!slackConfiguration) {
      continue;
    }

    // Slack keeps pushing events at a paused connector, so dropping them here
    // is what stops the churn once its token has been revoked.
    if (connector.isPaused()) {
      logger.info(
        { connectorId: connector.id, slackChannelId: channelId },
        "Ignoring messages because connector is paused"
      );
      continue;
    }

    const slackChannel = channelByConnectorId.get(connector.id);
    if (!slackChannel) {
      logger.info(
        { connectorId: connector.id, slackChannelId: channelId },
        "Ignoring messages because channel is not yet in DB"
      );
      continue;
    }
    if (slackChannel.skipReason) {
      logger.info(
        {
          connectorId: connector.id,
          slackChannelId: channelId,
          skipReason: slackChannel.skipReason,
        },
        `Ignoring messages because channel is skipped: ${slackChannel.skipReason}`
      );
      continue;
    }
    if (!["read", "read_write"].includes(slackChannel.permission)) {
      logger.info(
        {
          connectorId: connector.id,
          slackChannelId: channelId,
          permission: slackChannel.permission,
        },
        "Ignoring messages because channel permission is not read or read_write"
      );
      continue;
    }

    candidates.push({ connector, slackConfiguration });
  }

  return removeNulls(
    await concurrentExecutor(
      candidates,
      async (candidate) => {
        // /exists does no work beyond authentication and errors when the
        // workspace is gone, relocated or in maintenance.
        const existsRes = await getDustAPI(
          dataSourceConfigFromConnector(candidate.connector)
        ).exists();
        if (existsRes.isErr()) {
          logger.info(
            {
              connectorId: candidate.connector.id,
              slackChannelId: channelId,
              workspaceId: candidate.connector.workspaceId,
              error: existsRes.error.message,
            },
            "Ignoring messages because workspace is unavailable (likely in maintenance)"
          );
          return null;
        }
        return candidate;
      },
      { concurrency: 4 }
    )
  );
}

async function applyChannelRename(
  { connector, slackConfiguration }: SyncTarget,
  { channelId, channelName }: { channelId: string; channelName: string }
) {
  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: slackChannelInternalIdFromSlackChannelId(channelId),
    parents: [slackChannelInternalIdFromSlackChannelId(channelId)],
    parentId: null,
    title: `#${channelName}`,
    mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
    sourceUrl: getSlackChannelSourceUrl(channelId, slackConfiguration),
    providerVisibility: "public",
  });

  await updateSlackChannelInConnectorsDb({
    slackChannelId: channelId,
    slackChannelName: channelName,
    connectorId: connector.id,
  });
}

/**
 * Syncs a message posted in a channel or a group. A target that fails is
 * logged and dropped: Slack has already been answered, and the other targets
 * still have to run.
 */
async function syncChannelMessage(
  event: SlackWebhookEventPayload,
  slackConfigurations: SlackConfigurationResource[],
  logger: Logger
) {
  const { channelId, threadTs } = event;
  if (!channelId) {
    logger.info("Ignoring channel message without a channel");
    return;
  }

  const channelName =
    event.subtype === "channel_name" ? event.channelName : undefined;
  // A deleted message carries its own timestamp: we re-sync the thread it
  // belonged to, or the week it was posted in.
  const messageTs =
    event.subtype === "message_deleted" ? event.deletedTs : event.ts;

  if (event.subtype === "channel_name" && !channelName) {
    logger.info(
      { slackChannelId: channelId },
      "Ignoring channel_name event without a new name"
    );
    return;
  }
  if (!channelName && !threadTs && !messageTs) {
    logger.info(
      { slackChannelId: channelId },
      "Ignoring message event without 'thread_ts' or message 'ts'"
    );
    return;
  }

  const targets = await listSyncableConnectors(
    slackConfigurations,
    channelId,
    logger
  );

  // A target that fails does not stop the others, but it does fail the
  // activity: dropping the event would mean never syncing that thread.
  const errors: Error[] = [];

  for (const target of targets) {
    const { connector } = target;

    if (channelName) {
      await applyChannelRename(target, { channelId, channelName });
      logger.info(
        {
          connectorId: connector.id,
          slackChannelId: channelId,
          newName: channelName,
        },
        "Successfully processed Slack channel rename"
      );
    } else if (threadTs) {
      const res = await launchSlackSyncOneThreadWorkflow(
        connector.id,
        channelId,
        threadTs
      );
      if (res.isErr()) {
        logger.error(
          {
            err: res.error,
            connectorId: connector.id,
            slackChannelId: channelId,
            threadTs,
          },
          "Failed to launch Slack thread sync"
        );
        errors.push(res.error);
      }
    } else if (messageTs) {
      const res = await launchSlackSyncOneMessageWorkflow(
        connector.id,
        channelId,
        messageTs
      );
      if (res.isErr()) {
        logger.error(
          {
            err: res.error,
            connectorId: connector.id,
            slackChannelId: channelId,
            messageTs,
          },
          "Failed to launch Slack messages sync"
        );
        errors.push(res.error);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Failed to launch Slack sync for ${errors.length} connector(s): ` +
        errors.map((e) => e.message).join(", ")
    );
  }
}

async function handleAppMention(
  event: SlackWebhookEventPayload,
  teamId: string,
  logger: Logger
) {
  if (!event.channelId || !event.ts) {
    logger.info("Ignoring app_mention without a channel or a timestamp");
    return;
  }

  await handleDeprecatedChatBot({
    logger,
    slackChannel: event.channelId,
    slackMessageTs: event.ts,
    slackTeamId: teamId,
  });
}

/**
 * Resolves the connector running the bot for a Slack team, its client and its
 * bot user id. Returns null when the team has no enabled bot or when its
 * connector is paused.
 */
async function resolveActiveBot(teamId: string, logger: Logger) {
  const slackConfig = await SlackConfigurationResource.fetchByActiveBot(teamId);
  if (!slackConfig) {
    return null;
  }

  const connector = await ConnectorResource.fetchById(slackConfig.connectorId);
  if (!connector) {
    return null;
  }
  if (connector.isPaused()) {
    logger.info(
      { connectorId: connector.id },
      "Ignoring event because the bot connector is paused"
    );
    return null;
  }

  const slackClient = await getSlackClient(connector.id);
  const botUserIdRes = await getBotUserIdResponse(slackClient, connector.id);
  if (botUserIdRes.isErr()) {
    throw botUserIdRes.error;
  }

  return { botUserId: botUserIdRes.value, connector, slackClient };
}

async function handleDirectMessage(
  event: SlackWebhookEventPayload,
  teamId: string,
  logger: Logger
) {
  if (
    event.subtype === "message_changed" ||
    event.subtype === "message_deleted"
  ) {
    // Ignore message_changed and message_deleted events in private messages.
    return;
  }
  if (!event.channelId || !event.ts) {
    logger.info("Ignoring direct message without a channel or a timestamp");
    return;
  }

  const bot = await resolveActiveBot(teamId, logger);
  if (!bot) {
    logger.info(
      "Ignoring direct message: no usable Slack configuration with an enabled bot"
    );
    return;
  }

  if (event.userId === bot.botUserId) {
    // Message sent from the bot itself.
    return;
  }

  await handleDeprecatedChatBot({
    logger,
    slackChannel: event.channelId,
    slackMessageTs: event.ts,
    slackTeamId: teamId,
  });
}

async function joinCreatedChannel(
  event: SlackWebhookEventPayload,
  logger: Logger
) {
  if (!event.channelId || !event.contextTeamId) {
    logger.info("Ignoring channel_created event without a channel");
    return;
  }

  const res = await onChannelCreation({
    channelId: event.channelId,
    contextTeamId: event.contextTeamId,
    logger,
    provider: "slack",
  });
  if (res.isErr()) {
    throw res.error;
  }
}

async function announceBotJoinedPrivateChannel(
  event: SlackWebhookEventPayload,
  teamId: string,
  logger: Logger
) {
  const { channelId } = event;
  if (!channelId) {
    logger.info("Ignoring member_joined_channel event without a channel");
    return;
  }

  const bot = await resolveActiveBot(teamId, logger);
  if (!bot) {
    logger.info(
      "Ignoring member_joined_channel event: no usable Slack configuration with an enabled bot"
    );
    return;
  }

  // If the bot is not the one joining the channel, ignore.
  if (event.userId !== bot.botUserId) {
    return;
  }

  const { connector, slackClient } = bot;

  reportSlackUsage({
    connectorId: connector.id,
    method: "conversations.info",
    channelId,
  });
  const channelInfo = await withSlackErrorHandling(() =>
    slackClient.conversations.info({ channel: channelId })
  );

  if (channelInfo?.channel?.is_private) {
    reportSlackUsage({
      connectorId: connector.id,
      method: "chat.postMessage",
      channelId,
    });
    await withSlackErrorHandling(() =>
      slackClient.chat.postMessage({
        channel: channelId,
        text: "You can now talk to Dust in this channel. ⚠️ If private channel synchronization has been allowed on your Dust workspace, admins will now be able to synchronize data from this channel.",
      })
    );
  }
}

async function garbageCollectChannels(
  slackConfigurations: SlackConfigurationResource[],
  logger: Logger
) {
  const errors: Error[] = [];

  for (const slackConfiguration of slackConfigurations) {
    const res = await launchSlackGarbageCollectWorkflow(
      slackConfiguration.connectorId
    );
    if (res.isErr()) {
      logger.error(
        { err: res.error, connectorId: slackConfiguration.connectorId },
        "Failed to launch Slack garbage collection"
      );
      errors.push(res.error);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Failed to launch Slack garbage collection for ${errors.length} connector(s): ` +
        errors.map((e) => e.message).join(", ")
    );
  }
}

async function dispatchEvent(
  event: SlackWebhookEventPayload,
  teamId: string,
  slackConfigurations: SlackConfigurationResource[],
  logger: Logger
) {
  switch (event.type) {
    case "app_mention":
      return handleAppMention(event, teamId, logger);

    case "message":
      // Slack routes direct messages and channel messages through the same
      // event type.
      if (event.channelType === "im") {
        return handleDirectMessage(event, teamId, logger);
      }
      if (event.channelType === "channel" || event.channelType === "group") {
        return syncChannelMessage(event, slackConfigurations, logger);
      }
      return;

    case "channel_created":
      return joinCreatedChannel(event, logger);

    case "member_joined_channel":
      return announceBotJoinedPrivateChannel(event, teamId, logger);

    case "channel_left":
    case "channel_deleted":
      return garbageCollectChannels(slackConfigurations, logger);

    // The rename itself comes as a `message` event with the `channel_name`
    // subtype, handled above.
    case "channel_rename":
      return;

    default:
      logger.info(
        { eventType: event.type },
        "Webhook event type not supported"
      );
      return;
  }
}

/**
 * Processes one Slack webhook event. The webhook handler does no work at all,
 * so everything happens here: resolving the connectors, validating the channel
 * and dispatching the sync.
 *
 * A failing event is retried a bounded number of times (see the retry policy on
 * `slackWebhookEventWorkflow`) and then dropped: Slack was answered 200 and
 * never retries, so nothing else would ever pick the event up. Replaying is
 * safe because the handlers are idempotent: syncs are launched under
 * deterministic workflow ids, and the Slack messages the bot posts are the last
 * thing a handler does.
 */
export async function processSlackWebhookEventActivity({
  event,
  teamId,
}: {
  event: SlackWebhookEventPayload;
  teamId: string;
}) {
  const logger = mainLogger.child({
    connectorType: "slack",
    slackTeamId: teamId,
    eventType: event.type,
  });

  // Mirrors slack_webhook.events_queued.count emitted by the webhook handler.
  // A queued event that never shows up here means the workflow is wedged, which
  // nothing else would notice: Slack was answered 200 and never retries.
  statsDClient.increment("slack_webhook.events_processed.count", 1, [
    `event_type:${event.type}`,
  ]);

  const slackConfigurations = await SlackConfigurationResource.listForTeamId(
    teamId,
    "slack"
  );
  if (slackConfigurations.length === 0) {
    logger.info(
      "Dropping Slack webhook event: no Slack configuration for team"
    );
    return;
  }

  try {
    await dispatchEvent(event, teamId, slackConfigurations, logger);
  } catch (e) {
    logger.error(
      { err: normalizeError(e) },
      "Failed to process Slack webhook event"
    );
    // Counts attempts, not events: a retried event lands here once per attempt.
    statsDClient.increment("slack_webhook.event_errors.count", 1, [
      `event_type:${event.type}`,
    ]);

    throw e;
  }
}
