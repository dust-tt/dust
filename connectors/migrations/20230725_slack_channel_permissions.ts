import { getChannels } from "@connectors/connectors/slack/temporal/activities";
import { Connector } from "@connectors/lib/models";
import { SlackChannel } from "@connectors/lib/models/slack";

async function main() {
  const slackConnectors = await Connector.findAll({
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

    const channelsInSlack = await getChannels(c.id, true);
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
