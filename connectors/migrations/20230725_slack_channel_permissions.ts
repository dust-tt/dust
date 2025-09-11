import { getJoinedChannels } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { SlackChannel } from "@connectors/lib/models/slack";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

async function main() {
  const slackConnectors = await ConnectorModel.findAll({
    where: {
      type: "slack",
    },
  });

  for (const c of slackConnectors) {
    const channelsInDb = (
      await SlackChannel.findAll({
        where: {
          connectorId: c.id,
        },
      })
    ).reduce(
      (acc, c) => Object.assign(acc, { [c.slackChannelId]: c }),
      {} as {
        [key: string]: SlackChannel;
      }
    );

    const slackClient = await getSlackClient(c.id);

    const channelsInSlack = await getJoinedChannels(slackClient, c.id);
    const channelIdsInSlackSet = new Set(
      channelsInSlack.map((c) => c.id).filter((id) => id)
    );

    const channelIdsToDelete = Object.keys(channelsInDb).filter(
      (id) => !channelIdsInSlackSet.has(id)
    );
    console.log("Deleting channels", { channelIdsToDelete, connectorId: c.id });
    await SlackChannel.destroy({
      where: {
        connectorId: c.id,
        slackChannelId: channelIdsToDelete,
      },
    });

    for (const channel of channelsInSlack) {
      if (!channel.id) {
        console.log("Channel has no id", channel);
        continue;
      }
      if (!channel.name) {
        console.log("Channel has no name", channel);
        continue;
      }
      console.log("Upserting channel", {
        channelId: channel.id,
        connectorId: c.id,
      });
      const existingChannel = channelsInDb[channel.id];
      if (existingChannel) {
        await existingChannel.update({
          slackChannelName: channel.name,
        });
      } else {
        await SlackChannel.create({
          connectorId: c.id,
          slackChannelId: channel.id,
          slackChannelName: channel.name,
          permission: "read_write",
          private: !!channel.is_private,
        });
      }
    }
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
