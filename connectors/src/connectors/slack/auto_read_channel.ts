import type { DataSourceViewType, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
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

type SearchDataSourceViewsResponse = {
  data_source_views: DataSourceViewType[];
};

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
    const createdChannel = await SlackChannel.create({
      connectorId,
      slackChannelId,
      slackChannelName: remoteChannelName,
      permission: "read_write",
    });

    const baseSearchUrl = `${DUST_FRONT_API}/api/v1/w/${connector.workspaceId}/data_source_views/search`;
    const searchUrl =
      baseSearchUrl + `?kind=custom&dataSourceId=${connector.dataSourceId}`;
    const searchRes = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connector.workspaceAPIKey}`,
      },
    });

    if (!searchRes.ok) {
      logger.error({
        connectorId,
        channelId: slackChannelId,
        error: await searchRes.text(),
      });
      return new Err(new Error("Failed to join Slack channel in Dust."));
    }

    const dataSourceViews = (
      (await searchRes.json()) as SearchDataSourceViewsResponse
    ).data_source_views;

    if (dataSourceViews.length === 0 || !dataSourceViews[0]) {
      return new Err(
        new Error("There was an issue retrieving dataSourceViews")
      );
    }
    const joinSlackRes = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${connector.workspaceId}/data_source_views/${dataSourceViews[0].id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connector.workspaceAPIKey}`,
        },
        body: JSON.stringify({
          parentsIn: [createdChannel.slackChannelId],
        }),
      }
    );

    if (!joinSlackRes.ok) {
      logger.error({
        connectorId,
        channelId: slackChannelId,
        error: await searchRes.text(),
      });
      return new Err(new Error("Failed to join Slack channel in Dust."));
    }
  }
  return new Ok(undefined);
}
