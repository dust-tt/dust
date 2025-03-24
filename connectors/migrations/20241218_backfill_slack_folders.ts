import { makeScript } from "scripts/helpers";

import { slackChannelInternalIdFromSlackChannelId } from "@connectors/connectors/slack/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel } from "@connectors/lib/models/slack";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const FOLDER_CONCURRENCY = 16;

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("slack", {});

  for (const connector of connectors) {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const connectorId = connector.id;

    const channels = await SlackChannel.findAll({
      where: {
        connectorId: connectorId,
      },
    });

    if (execute) {
      await concurrentExecutor(
        channels,
        async (channel) => {
          const internalId = slackChannelInternalIdFromSlackChannelId(
            channel.slackChannelId
          );
          try {
            await upsertDataSourceFolder({
              dataSourceConfig,
              folderId: internalId,
              title: `#${channel.slackChannelName}`,
              parentId: null,
              parents: [internalId],
              mimeType: "application/vnd.dust.slack.channel",
            });
          } catch (error) {
            logger.error(
              `Error upserting folder for channel ${channel.slackChannelId}: ${error}`
            );
          }
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
