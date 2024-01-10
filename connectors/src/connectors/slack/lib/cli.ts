import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { SlackChannel } from "@connectors/lib/models/slack";

export async function maybeLaunchSlackSyncWorkflowForChannelId(
  connectorId: number,
  slackChannelId: string
) {
  const channelId = await SlackChannel.findOne({
    attributes: ["id"],
    where: {
      connectorId,
      slackChannelId,
    },
  });

  if (!channelId) {
    throw new Error(`Slack channel ${slackChannelId} does not exist in DB.`);
  }

  return launchSlackSyncWorkflow(connectorId.toString(), null, [
    slackChannelId,
  ]);
}
