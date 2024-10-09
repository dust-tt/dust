import type { Result } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { apiConfig } from "@connectors/lib/api/config";
import {
  SlackChannel,
  SlackConfigurationModel,
} from "@connectors/lib/models/slack";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const { DUST_FRONT_API } = process.env;
if (!DUST_FRONT_API) {
  throw new Error("FRONT_API not set");
}

export function isChannelNameWhitelisted(
  remoteChannelName: string,
  autoReadChannelPattern?: string | null
): boolean {
  if (!autoReadChannelPattern) {
    return false;
  }

  const regex = new RegExp(autoReadChannelPattern);
  return regex.test(remoteChannelName);
}

export async function autoReadChannel(
  teamId: string,
  logger: Logger,
  slackChannelId: string
): Promise<Result<undefined, Error>> {
  const slackConfiguration = await SlackConfigurationModel.findOne({
    where: {
      slackTeamId: teamId,
    },
  });
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

  const { autoReadChannelPattern } = slackConfiguration;
  const isWhiteListed = isChannelNameWhitelisted(
    remoteChannelName,
    autoReadChannelPattern
  );
  if (isWhiteListed) {
    const joinChannelRes = await joinChannel(connectorId, slackChannelId);
    if (joinChannelRes.isErr()) {
      return joinChannelRes;
    }
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
      {
        useLocalInDev: false,
        urlOverride: DUST_FRONT_API,
      }
    );

    const searchParams = new URLSearchParams({
      kind: "custom",
      vaultKind: "global",
      datasourceId: connector.dataSourceId,
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

    const patchData = {
      parentsToAdd: [channel.slackChannelId],
      parentsToRemove: undefined,
    };
    const joinSlackRes = await dustAPI.patchDataSourceViews(
      dataSourceView,
      patchData
    );

    if (joinSlackRes.isErr()) {
      logger.error({
        connectorId,
        channelId: slackChannelId,
        error: joinSlackRes.error.message,
      });
      return new Err(new Error("Failed to join Slack channel in Dust."));
    }
  }
  return new Ok(undefined);
}
