import { sequelize_conn, SlackChannel } from "@connectors/lib/models";

export type SlackChannelType = {
  id: number;
  connectorId: number;

  name: string;
  slackId: string;
  isIndexed: boolean;
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
        isIndexed: true,
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
    isIndexed: channel.isIndexed,
  };
}

export async function deleteChannelFromConnectorsDb({
  slackChannelId,
  connectorId,
}: {
  slackChannelId: string;
  connectorId: number;
}): Promise<void> {
  await SlackChannel.destroy({
    where: {
      connectorId,
      slackChannelId,
    },
  });
}
