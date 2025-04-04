import {
  joinChannel,
  updateSlackChannelInConnectorsDb,
} from "@connectors/connectors/slack/lib/channels";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { getChannel } from "@connectors/connectors/slack/temporal/activities";
import {
  launchSlackGarbageCollectWorkflow,
  launchSlackSyncOneThreadWorkflow,
  launchSlackSyncWorkflow,
} from "@connectors/connectors/slack/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { throwOnError } from "@connectors/lib/cli";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel } from "@connectors/lib/models/slack";
import { default as topLogger } from "@connectors/logger/logger";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type {
  AdminSuccessResponseType,
  SlackCommandType,
} from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  isSlackbotWhitelistType,
} from "@connectors/types";

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

  return launchSlackSyncWorkflow(connectorId, null, [slackChannelId]);
}

export const slack = async ({
  command,
  args,
}: SlackCommandType): Promise<AdminSuccessResponseType> => {
  const logger = topLogger.child({ majorCommand: "slack", command, args });
  switch (command) {
    case "enable-bot": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }
      const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
        connector.id
      );
      if (!slackConfig) {
        throw new Error(
          `Could not find slack configuration for connector ${connector.id}`
        );
      }

      const res = await slackConfig.enableBot();
      if (res.isErr()) {
        throw res.error;
      }
      return { success: true };
    }

    case "sync-channel": {
      const { channelId, wId } = args;

      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!channelId) {
        throw new Error("Missing --channelId argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: wId,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${wId}`);
      }

      await throwOnError(
        maybeLaunchSlackSyncWorkflowForChannelId(connector.id, channelId)
      );

      return { success: true };
    }

    case "sync-thread": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.threadId) {
        throw new Error("Missing --threadId argument");
      }
      if (!args.channelId) {
        throw new Error("Missing --channelId argument");
      }
      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }
      await throwOnError(
        launchSlackSyncOneThreadWorkflow(
          connector.id,
          args.channelId,
          args.threadId
        )
      );

      return { success: true };
    }

    case "whitelist-domains": {
      const { wId, whitelistedDomains } = args;
      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!whitelistedDomains) {
        throw new Error(
          "Missing --whitelistedDomains argument. Eg: --whitelistedDomains=example.com:group1,example2.com:group2"
        );
      }
      for (const domain of whitelistedDomains.split(",")) {
        if (domain.split(":").length !== 2) {
          throw new Error(
            `Invalid domain format: ${domain}. Eg: --whitelistedDomains=example.com:group1,example2.com:group2`
          );
        }
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });

      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      const whitelistedDomainsArray = whitelistedDomains.split(",");
      // TODO(2024-01-10 flav) Add domain validation.
      logger.info(
        `[Admin] Whitelisting following domains for slack:\n- ${whitelistedDomainsArray.join(
          "\n-"
        )}`
      );

      const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
        connector.id
      );
      if (slackConfig) {
        await slackConfig.setWhitelistedDomains(whitelistedDomainsArray);
      }

      return { success: true };
    }

    case "whitelist-bot": {
      const { wId, botName, groupId, whitelistType } = args;
      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!botName) {
        throw new Error("Missing --botName argument");
      }

      if (!groupId) {
        throw new Error("Missing --groupId argument");
      }

      if (!whitelistType || !isSlackbotWhitelistType(whitelistType)) {
        throw new Error(
          "--whitelistType argument must be set to 'summon_agent' or 'index_messages'"
        );
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });

      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      logger.info(`[Admin] Whitelisting following bot for slack: ${botName}`);

      const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
        connector.id
      );

      if (slackConfig) {
        await slackConfig.whitelistBot(botName, [groupId], whitelistType);
      }

      return { success: true };
    }

    case "sync-channel-metadata": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.channelId) {
        throw new Error("Missing --channelId argument");
      }
      const connector = await ConnectorModel.findOne({
        where: { workspaceId: `${args.wId}`, type: "slack" },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      const remoteChannel = await getChannel(connector.id, args.channelId);
      if (!remoteChannel.name) {
        throw new Error(
          `Could not find channel name for channel ${args.channelId}`
        );
      }
      const dataSourceConfig = dataSourceConfigFromConnector(connector);

      const channel = await updateSlackChannelInConnectorsDb({
        slackChannelId: args.channelId,
        slackChannelName: remoteChannel.name,
        connectorId: connector.id,
      });

      const slackConfiguration =
        await SlackConfigurationResource.fetchByConnectorId(connector.id);
      if (!slackConfiguration) {
        throw new Error(
          `Could not find Slack configuration for connector ${connector.id}`
        );
      }

      if (!["read", "read_write"].includes(channel.permission)) {
        logger.info(
          {
            connectorId: connector.id,
            channelId: args.channelId,
            channelName: remoteChannel.name,
          },
          "Channel is not indexed, skipping"
        );
        return { success: true };
      }

      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: slackChannelInternalIdFromSlackChannelId(args.channelId),
        title: `#${channel.name}`,
        parentId: null,
        parents: [slackChannelInternalIdFromSlackChannelId(args.channelId)],
        mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
        sourceUrl: getSlackChannelSourceUrl(args.channelId, slackConfiguration),
        providerVisibility: channel.private ? "private" : "public",
      });
      return { success: true };
    }

    case "remove-channel-from-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.channelId) {
        throw new Error("Missing --channelId argument");
      }
      const connector = await ConnectorModel.findOne({
        where: { workspaceId: `${args.wId}`, type: "slack" },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      const remoteChannel = await getChannel(connector.id, args.channelId);
      if (!remoteChannel.name) {
        throw new Error(
          `Could not find channel name for channel ${args.channelId}`
        );
      }

      const channel = await SlackChannel.findOne({
        where: {
          connectorId: connector.id,
          slackChannelId: args.channelId,
        },
      });
      if (!channel) {
        throw new Error(`Could not find channel ${args.channelId} in database`);
      }

      await channel.update({
        permission: "write",
      });

      const workflowRes = await launchSlackGarbageCollectWorkflow(connector.id);
      if (workflowRes.isErr()) {
        throw new Error(
          `Could not launch garbage collect workflow for channel ${args.channelId}: ` +
            `${workflowRes.error}`
        );
      }

      return { success: true };
    }

    case "add-channel-to-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.channelId) {
        throw new Error("Missing --channelId argument");
      }
      const connector = await ConnectorModel.findOne({
        where: { workspaceId: `${args.wId}`, type: "slack" },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      const remoteChannel = await getChannel(connector.id, args.channelId);
      if (!remoteChannel.name) {
        throw new Error(
          `Could not find channel name for channel ${args.channelId}`
        );
      }

      const joinRes = await joinChannel(connector.id, args.channelId);
      if (joinRes.isErr()) {
        throw new Error(
          `Could not join channel ${args.channelId}: ${joinRes.error}`
        );
      }

      const channel = await updateSlackChannelInConnectorsDb({
        slackChannelId: args.channelId,
        slackChannelName: remoteChannel.name,
        connectorId: connector.id,
        createIfNotExistsWithParams: {
          permission: "read_write",
          private: !!remoteChannel.is_private,
        },
      });

      const workflowRes = await launchSlackSyncWorkflow(connector.id, null, [
        channel.slackId,
      ]);
      if (workflowRes.isErr()) {
        throw new Error(
          `Could not launch workflow for channel ${args.channelId}: ${workflowRes.error}`
        );
      }

      return { success: true };
    }

    default:
      throw new Error("Unknown slack command: " + command);
  }
};
