import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { makeScript } from "scripts/helpers";

import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { getChannels } from "@connectors/connectors/slack/temporal/activities";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel } from "@connectors/lib/models/slack";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

async function setupSlackChannel({
  channel,
  connector,
  slackConfiguration,
  logger,
}: {
  channel: Channel;
  connector: ConnectorResource;
  slackConfiguration: SlackConfigurationResource;
  logger: typeof Logger;
}) {
  if (!channel.id || !channel.name) {
    return;
  }

  const joinResult = await joinChannel(connector.id, channel.id);
  if (joinResult.isErr()) {
    logger.error(
      `Failed to join channel #${channel.name}: ${joinResult.error.message}`
    );
    return;
  }

  // Find existing channel in DB
  const existingChannel = await SlackChannel.findOne({
    where: {
      connectorId: connector.id,
      slackChannelId: channel.id,
    },
  });

  if (existingChannel) {
    await existingChannel.update({
      slackChannelName: channel.name,
      permission: "read_write",
      private: !!channel.is_private,
    });
    logger.info(`Updated configuration for channel #${channel.name}`);
  } else {
    await SlackChannel.create({
      connectorId: connector.id,
      slackChannelId: channel.id,
      slackChannelName: channel.name,
      permission: "read_write",
      private: !!channel.is_private,
    });
    logger.info(`Created configuration for channel #${channel.name}`);
  }

  // Create/update folder in data source
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const folderId = slackChannelInternalIdFromSlackChannelId(channel.id);
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId,
    title: `#${channel.name}`,
    parentId: null,
    parents: [folderId],
    mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
    sourceUrl: getSlackChannelSourceUrl(channel.id, slackConfiguration),
    providerVisibility: channel.is_private ? "private" : "public",
  });
  logger.info(`Upserted data source folder for channel #${channel.name}`);
}

makeScript(
  {
    pattern: { type: "string" },
    connectorId: { type: "string" },
  },
  async ({ pattern, connectorId, execute }, logger) => {
    const connector = await ConnectorResource.fetchById(
      parseInt(connectorId, 10)
    );
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    const slackConfiguration =
      await SlackConfigurationResource.fetchByConnectorId(
        parseInt(connectorId, 10)
      );
    if (!slackConfiguration) {
      throw new Error(
        `Slack configuration not found for connector ${connectorId}`
      );
    }

    // Get all channels from Slack
    const remoteChannels = await getChannels(parseInt(connectorId, 10), false);
    const matchingChannels = remoteChannels.filter(
      (c) => c.name && new RegExp(pattern).test(c.name)
    );

    logger.info(
      `Found ${matchingChannels.length} channels matching pattern '${pattern}'`
    );

    if (execute) {
      for (const channel of matchingChannels) {
        await setupSlackChannel({
          channel,
          connector,
          slackConfiguration,
          logger: logger.child({
            channelId: channel.id,
            channelName: channel.name,
          }),
        });
      }
    } else {
      logger.info("Dry run - no channels were actually joined");
      for (const channel of matchingChannels) {
        logger.info(`Would join channel #${channel.name}`);
      }
    }
  }
);
