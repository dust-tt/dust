import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel } from "@connectors/lib/models/slack";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

const FOLDER_CONCURRENCY = 16;

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("slack", {});

  for (const connector of connectors) {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const connectorId = connector.id;

    const channels = await SlackChannel.findAll({
      where: {
        connectorId: connectorId,
        permission: { [Op.or]: ["read", "read_write"] },
      },
    });

    const slackConfiguration =
      await SlackConfigurationResource.fetchByConnectorId(connectorId);

    if (!slackConfiguration) {
      throw new Error(
        `Could not find slack configuration for connector ${connectorId}`
      );
    }

    if (execute) {
      await concurrentExecutor(
        channels,
        async (channel) => {
          const internalId = slackChannelInternalIdFromSlackChannelId(
            channel.slackChannelId
          );
          await upsertDataSourceFolder({
            dataSourceConfig,
            folderId: internalId,
            title: `#${channel.slackChannelName}`,
            parentId: null,
            parents: [internalId],
            mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
            providerVisibility: channel.private ? "private" : "public",
            sourceUrl: getSlackChannelSourceUrl(
              channel.slackChannelId,
              slackConfiguration
            ),
          });
        },
        { concurrency: FOLDER_CONCURRENCY }
      );
      logger.info(
        `Upserted ${channels.length} channels for connector ${connector.id}`
      );
    } else {
      logger.info(
        `Found ${channels.length} channels for connector ${connector.id}`
      );
    }
  }
});
