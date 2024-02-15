import type { ConnectorPermission, ModelId } from "@dust-tt/types";
import type { CodedError, WebAPIPlatformError } from "@slack/web-api";
import { ErrorCode } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

import { SlackChannel } from "@connectors/lib/models/slack";
import type { Result } from "@connectors/lib/result";
import { Err, Ok } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

import { getSlackClient } from "./slack_client";

export type SlackChannelType = {
  id: number;
  connectorId: number;

  name: string;
  slackId: string;
  permission: ConnectorPermission;
  agentConfigurationId: string | null;
};

export async function updateSlackChannelInConnectorsDb({
  slackChannelId,
  slackChannelName,
  connectorId,
}: {
  slackChannelId: string;
  slackChannelName: string;
  connectorId: number;
}): Promise<SlackChannelType> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Could not find connector ${connectorId}`);
  }

  let channel = await SlackChannel.findOne({
    where: {
      connectorId,
      slackChannelId,
    },
  });

  if (!channel) {
    throw new Error(
      `Could not find channel: connectorId=${connectorId} slackChannelId=${slackChannelId}`
    );
  } else {
    if (channel.slackChannelName !== slackChannelName) {
      channel = await channel.update({
        slackChannelName,
      });
    }
  }

  return {
    id: channel.id,
    connectorId: channel.connectorId,
    name: channel.slackChannelName,
    slackId: channel.slackChannelId,
    permission: channel.permission,
    agentConfigurationId: channel.agentConfigurationId,
  };
}

export async function joinChannel(
  connectorId: ModelId,
  channelId: string
): Promise<
  Result<
    { result: "ok" | "already_joined" | "is_archived"; channel: Channel },
    Error
  >
> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const client = await getSlackClient(connector.id);
  try {
    const channelInfo = await client.conversations.info({ channel: channelId });
    if (!channelInfo.channel) {
      return new Err(new Error("Channel not found."));
    }
    if (channelInfo.channel?.is_member) {
      return new Ok({ result: "already_joined", channel: channelInfo.channel });
    }
    if (channelInfo.channel?.is_archived) {
      return new Ok({ result: "is_archived", channel: channelInfo.channel });
    }
    const joinRes = await client.conversations.join({ channel: channelId });
    if (joinRes.ok) {
      return new Ok({ result: "ok", channel: channelInfo.channel });
    } else {
      return new Ok({ result: "already_joined", channel: channelInfo.channel });
    }
  } catch (e) {
    const slackError = e as CodedError;
    if (slackError.code === ErrorCode.PlatformError) {
      const platformError = slackError as WebAPIPlatformError;
      if (platformError.data.error === "missing_scope") {
        logger.info(
          {
            channelId,
            connectorId,
          },
          "Could not join the channel because of a missing scope. Please re-authorize your Slack connection and try again."
        );
        return new Err(
          new Error(
            "Could not join the channel because of a missing scope. Please re-authorize your Slack connection and try again."
          )
        );
      }
      throw e;
    }
  }

  return new Err(new Error(`Can't join the channel`));
}
