import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import {
  SlackChannel,
  SlackConfigurationModel,
} from "@connectors/lib/models/slack";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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
    await SlackChannel.create({
      connectorId,
      slackChannelId,
      slackChannelName: remoteChannelName,
      permission: "read_write",
    });
  }
  return new Ok(undefined);
}
