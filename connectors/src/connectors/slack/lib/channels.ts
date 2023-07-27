import {
  Connector,
  sequelize_conn,
  SlackChannel,
  SlackConfiguration,
} from "@connectors/lib/models";
import { ConnectorPermission } from "@connectors/types/resources";

export type SlackChannelType = {
  id: number;
  connectorId: number;

  name: string;
  slackId: string;
  permission: ConnectorPermission;
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
  const transaction = await sequelize_conn.transaction();

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

  await transaction.commit();

  return {
    id: channel.id,
    connectorId: channel.connectorId,
    name: channel.slackChannelName,
    slackId: channel.slackChannelId,
    permission: channel.permission,
  };
}
