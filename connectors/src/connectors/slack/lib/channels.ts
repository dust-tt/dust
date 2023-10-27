import { CodedError, ErrorCode, WebAPIPlatformError } from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

import {
  Connector,
  ModelId,
  sequelize_conn,
  SlackChannel,
} from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { ConnectorPermission } from "@connectors/types/resources";

import { getSlackClient } from "./slack_client";

export type SlackChannelType = {
  id: number;
  connectorId: number;

  name: string;
  slackId: string;
  permission: ConnectorPermission;
  agentConfigurationId: string | null;
};

export async function upsertSlackChannelInConnectorsDb({
  slackChannelId,
  slackChannelName,
  connectorId,
}: {
  slackChannelId: string;
  slackChannelName: string;
  connectorId: number;
}): Promise<SlackChannelType> {
  return await sequelize_conn.transaction(async (transaction) => {
    const connector = await Connector.findOne({
      where: {
        id: connectorId,
      },
      transaction,
    });

    if (!connector) {
      throw new Error(`Could not find connector ${connectorId}`);
    }

    let channel = await SlackChannel.findOne({
      where: {
        connectorId,
        slackChannelId,
      },
      transaction,
    });

    if (!channel) {
      channel = await SlackChannel.create(
        {
          connectorId,
          slackChannelId,
          slackChannelName,
          permission: connector.defaultNewResourcePermission,
        },
        { transaction }
      );
    } else {
      if (channel.slackChannelName !== slackChannelName) {
        channel = await channel.update(
          {
            slackChannelName,
          },
          { transaction }
        );
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
  });
}

export async function joinChannel(
  connectorId: ModelId,
  channelId: string
): Promise<
  Result<{ result: "ok" | "already_joined"; channel: Channel }, Error>
> {
  const connector = await Connector.findByPk(connectorId);
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
