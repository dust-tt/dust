import { DustAPI } from "@dust-tt/client";
import type { Result, SlackAutoReadPattern } from "@dust-tt/types";
import { Err, MIME_TYPES, Ok } from "@dust-tt/types";

import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel } from "@connectors/lib/models/slack";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

function findMatchingChannelPatterns(
  remoteChannelName: string,
  autoReadChannelPatterns: SlackAutoReadPattern[]
): SlackAutoReadPattern[] {
  return autoReadChannelPatterns.filter((pattern) => {
    const regex = new RegExp(pattern.pattern);
    return regex.test(remoteChannelName);
  });
}

export async function autoReadChannel(
  teamId: string,
  logger: Logger,
  slackChannelId: string
): Promise<Result<undefined, Error>> {
  const slackConfiguration =
    await SlackConfigurationResource.fetchByTeamId(teamId);
  if (!slackConfiguration) {
    return new Err(
      new Error(`Slack configuration not found for teamId ${teamId}`)
    );
  }
  const { connectorId } = slackConfiguration;

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const slackClient = await getSlackClient(connectorId);
  const remoteChannel = await slackClient.conversations.info({
    channel: slackChannelId,
  });
  const remoteChannelName = remoteChannel.channel?.name;

  if (!remoteChannel.ok || !remoteChannelName) {
    logger.error({
      connectorId,
      channelId: slackChannelId,
      error: remoteChannel.error,
    });
    return new Err(new Error("Could not get the Slack channel information."));
  }

  const { autoReadChannelPatterns } = slackConfiguration;

  const matchingPatterns = findMatchingChannelPatterns(
    remoteChannelName,
    autoReadChannelPatterns
  );
  if (matchingPatterns.length > 0) {
    const joinChannelRes = await joinChannel(connectorId, slackChannelId);
    if (joinChannelRes.isErr()) {
      return joinChannelRes;
    }

    await upsertDataSourceFolder({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      folderId: slackChannelInternalIdFromSlackChannelId(slackChannelId),
      title: `#${remoteChannelName}`,
      parentId: null,
      parents: [slackChannelInternalIdFromSlackChannelId(slackChannelId)],
      mimeType: MIME_TYPES.SLACK.CHANNEL,
      sourceUrl: getSlackChannelSourceUrl(slackChannelId, slackConfiguration),
      providerVisibility: remoteChannel.channel?.is_private
        ? "private"
        : "public",
    });
    let channel: SlackChannel | null = null;
    channel = await SlackChannel.findOne({
      where: {
        slackChannelId,
        connectorId,
      },
    });
    if (!channel) {
      channel = await SlackChannel.create({
        connectorId,
        slackChannelId,
        slackChannelName: remoteChannelName,
        permission: "read_write",
        private: remoteChannel.channel?.is_private ?? false,
      });
    } else {
      await channel.update({
        permission: "read_write",
      });
    }

    const dustAPI = new DustAPI(
      apiConfig.getDustAPIConfig(),
      {
        workspaceId: connector.workspaceId,
        apiKey: connector.workspaceAPIKey,
      },
      logger,
      apiConfig.getDustFrontAPIUrl()
    );

    // Loop through all the matching patterns. Swallow errors and continue.
    const results = await concurrentExecutor(
      matchingPatterns,
      async (p) => {
        const searchParams = new URLSearchParams({
          vaultId: p.spaceId,
          dataSourceId: connector.dataSourceId,
        });

        const searchRes = await dustAPI.searchDataSourceViews(searchParams);
        if (searchRes.isErr()) {
          logger.error({
            connectorId,
            channelId: slackChannelId,
            error: searchRes.error.message,
          });

          return new Err(new Error("Failed to join Slack channel in Dust."));
        }

        const [dataSourceView] = searchRes.value;
        if (!dataSourceView) {
          logger.error({
            connectorId,
            channelId: slackChannelId,
            error:
              "Failed to join Slack channel, there was an issue retrieving dataSourceViews",
          });

          return new Err(
            new Error("There was an issue retrieving dataSourceViews")
          );
        }

        const updateDataSourceViewRes = await dustAPI.patchDataSourceView(
          dataSourceView,
          {
            parentsToAdd: [
              slackChannelInternalIdFromSlackChannelId(channel.slackChannelId),
            ],
            parentsToRemove: undefined,
          }
        );

        if (updateDataSourceViewRes.isErr()) {
          logger.error({
            connectorId,
            channelId: slackChannelId,
            error: updateDataSourceViewRes.error.message,
          });
          return new Err(
            new Error(
              `Failed to update Slack data source view for space ${p.spaceId}.`
            )
          );
        }

        return new Ok(undefined);
      },
      { concurrency: 1 }
    );

    // If any error, return the first error.
    if (results.some((r) => r.isErr())) {
      return results.find((r) => r.isErr())!;
    }
  }

  return new Ok(undefined);
}
