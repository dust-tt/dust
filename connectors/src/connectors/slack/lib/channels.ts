import {
  sequelize_conn,
  SlackChannel,
  SlackConfiguration,
} from "@connectors/lib/models";

export type SlackChannelType = {
  id: number;
  connectorId: number;

  name: string;
  slackId: string;
  permission: "none" | "read" | "write" | "read_write";
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
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId,
    },
    transaction,
  });

  if (!slackConfig) {
    await transaction.rollback();
    throw new Error("Slack configuration not found");
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
        permission: slackConfig.defaultChannelPermission,
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
