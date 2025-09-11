import type { Channel } from "@slack/web-api/dist/types/response/ConversationsInfoResponse";
import { makeScript } from "scripts/helpers";

import {
  getAllChannels,
  joinChannel,
} from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { SlackChannel } from "@connectors/lib/models/slack";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

async function setupSlackChannel({
  channel,
  connector,
  logger,
}: {
  channel: Channel;
  connector: ConnectorResource;
  logger: typeof Logger;
}) {
  // Skip private channels.
  if (!channel.id || !channel.name || channel.is_private) {
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
}

makeScript(
  {
    pattern: { type: "string", required: true },
    connectorId: { type: "string", required: true },
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

    // Get all channels from Slack.
    const slackClient = await getSlackClient(connector.id);
    const remoteChannels = await getAllChannels(
      slackClient,
      parseInt(connectorId, 10)
    );
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
