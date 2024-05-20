import type { Request, Response } from "express";

import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import {
  SlackChannel,
  SlackConfigurationModel,
} from "@connectors/lib/models/slack";
import type { Logger } from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export function isChannelNameWhitelisted(
  remoteChannelName: string,
  whiteListedChannelPatterns?: string
): boolean {
  if (!whiteListedChannelPatterns) {
    return false;
  }

  const regex = new RegExp(whiteListedChannelPatterns);
  return regex.test(remoteChannelName);
}

export async function autoJoinChannel(
  req: Request,
  res: Response,
  logger: Logger
): Promise<void> {
  const teamId = req.body.team_id;
  const slackChannelId = req.body.event?.channel;
  const slackConfiguration = await SlackConfigurationModel.findOne({
    where: {
      slackTeamId: teamId,
    },
  });
  if (!slackConfiguration || !slackChannelId) {
    return apiError(req, res, {
      api_error: {
        type: "slack_configuration_not_found",
        message: `Slack configuration not found for teamId ${teamId}`,
      },
      status_code: 404,
    });
  }
  const { connectorId } = slackConfiguration;

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: `Connector ${req.params.connector_id} not found`,
      },
      status_code: 404,
    });
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
    return apiError(req, res, {
      api_error: {
        type: "slack_channel_not_found",
        message: "Could not get the Slack channel information.",
      },
      status_code: 404,
    });
  }

  const { whiteListedChannelPatterns } = slackConfiguration;
  const isWhiteListed = isChannelNameWhitelisted(
    remoteChannelName,
    whiteListedChannelPatterns
  );
  if (isWhiteListed) {
    try {
      await SlackChannel.create({
        connectorId: connectorId,
        slackChannelId: slackChannelId,
        slackChannelName: remoteChannelName,
        permission: "read_write",
      });
    } catch (error) {
      logger.error({
        connectorId,
        channelId: slackChannelId,
        error: remoteChannel.error,
      });
      return apiError(req, res, {
        api_error: {
          type: "slack_channel_not_found",
          message: "Could not create the Slack channel.",
        },
        status_code: 404,
      });
    }
    const joinChannelRes = await joinChannel(connectorId, slackChannelId);
    if (joinChannelRes.isErr()) {
      throw new Error(
        `Our Slack bot (@Dust) was not able to join the Slack channel #${remoteChannelName}. Please re-authorize Slack or invite @Dust from #${remoteChannelName} on Slack.`
      );
    }
  }
}
