import {
  autoReadChannel,
  findMatchingChannelPatterns,
} from "@connectors/connectors/slack/auto_read_channel";
import {
  getAllChannels,
  getChannelById,
  joinChannel,
  updateSlackChannelInConnectorsDb,
} from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import {
  launchSlackGarbageCollectWorkflow,
  launchSlackMigrateChannelsFromLegacyBotToNewBotWorkflow,
  launchSlackSyncOneThreadWorkflow,
  launchSlackSyncWorkflow,
} from "@connectors/connectors/slack/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { throwOnError } from "@connectors/lib/cli";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel, SlackMessages } from "@connectors/lib/models/slack";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type {
  AdminSuccessResponseType,
  SlackCommandType,
  SlackJoinResponseType as SlackJoinResponseType,
} from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  isSlackbotWhitelistType,
  normalizeError,
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
}: SlackCommandType): Promise<
  AdminSuccessResponseType | SlackJoinResponseType
> => {
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

      const thread = await SlackMessages.findOne({
        where: {
          connectorId: connector.id,
          channelId: args.channelId,
          messageTs: args.threadId,
        },
      });
      if (thread && thread.skipReason) {
        throw new Error(
          `Thread ${args.threadId} is skipped with reason: ${thread.skipReason}`
        );
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

    case "skip-thread": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.threadTs) {
        throw new Error("Missing --threadTs argument");
      }
      if (!args.channelId) {
        throw new Error("Missing --channelId argument");
      }
      if (!args.skipReason) {
        throw new Error("Missing --skipReason argument");
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

      const existingMessage = await SlackMessages.findOne({
        where: {
          connectorId: connector.id,
          channelId: args.channelId,
          messageTs: args.threadTs,
        },
      });

      if (existingMessage) {
        await existingMessage.update({
          skipReason: args.skipReason,
        });
        logger.info(
          `Thread ${args.threadTs} will now be skipped with reason: ${args.skipReason}`
        );
      } else {
        logger.info(`Thread ${args.threadTs} not found in DB, skipping.`);
      }

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
      const { wId, botName, groupId, whitelistType, providerType } = args;
      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!botName) {
        throw new Error("Missing --botName argument");
      }

      if (!groupId) {
        throw new Error("Missing --groupId argument");
      }

      if (!providerType) {
        throw new Error("Missing --providerType argument");
      }

      if (!["slack", "slack_bot"].includes(providerType)) {
        throw new Error(
          "--providerType argument must be set to 'slack' or 'slack_bot'"
        );
      }

      if (!whitelistType || !isSlackbotWhitelistType(whitelistType)) {
        throw new Error(
          "--whitelistType argument must be set to 'summon_agent' or 'index_messages'"
        );
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: providerType,
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
        // Handle groupId as either a single string or comma-separated string of group IDs
        const groupIds = groupId.includes(",")
          ? groupId.split(",").map((id) => id.trim())
          : [groupId];
        await slackConfig.whitelistBot(botName, groupIds, whitelistType);
      }

      return { success: true };
    }

    case "run-auto-join": {
      // Auto-join channels based on autoReadChannelPatterns configuration
      // Usage: --wId <workspaceId> --providerType <slack|slack_bot>
      // This command fetches all channels from Slack, matches them against
      // the configured autoReadChannelPatterns regex patterns, and processes
      // all matching channels using the autoReadChannel function (same logic
      // as when a new channel is created via webhook).
      const { wId, providerType, force } = args;
      if (!wId) {
        throw new Error("Missing --wId argument");
      }

      if (!providerType) {
        throw new Error("Missing --providerType argument");
      }

      if (!["slack", "slack_bot"].includes(providerType)) {
        throw new Error(
          "--providerType argument must be set to 'slack' or 'slack_bot'"
        );
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: providerType,
        },
      });

      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      const slackConfiguration =
        await SlackConfigurationResource.fetchByConnectorId(connector.id);
      if (!slackConfiguration) {
        throw new Error(
          `Could not find Slack configuration for connector ${connector.id}`
        );
      }

      const { autoReadChannelPatterns } = slackConfiguration;
      if (!autoReadChannelPatterns || autoReadChannelPatterns.length === 0) {
        logger.info(
          { connectorId: connector.id },
          "No autoReadChannelPatterns configured, skipping"
        );
        return { success: true };
      }

      const slackClient = await getSlackClient(connector.id);

      // Fetch all channels from Slack
      const allChannels = await getAllChannels(slackClient, connector.id);
      logger.info(
        { connectorId: connector.id, totalChannels: allChannels.length },
        "Fetched all channels from Slack"
      );

      // Process each matching channel using autoReadChannel
      let processedCount = 0;
      let errorCount = 0;

      allChannels.sort((a, b) => {
        if (a.name && b.name) {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });

      for (const channel of allChannels) {
        if (!channel.id || !channel.name) {
          continue;
        }

        logger.info({ channelName: channel.name }, "Processing channel");

        const matchingPatterns = findMatchingChannelPatterns(
          channel.name,
          autoReadChannelPatterns
        );
        if (matchingPatterns.length === 0) {
          logger.info({ channelName: channel.name }, "No match, skipping");
          continue;
        }

        if (!force) {
          if (channel.is_member) {
            logger.info(
              {
                connectorId: connector.id,
                channelId: channel.id,
                channelName: channel.name,
              },
              "Channel is already joined, skipping"
            );
            continue;
          }
        }

        try {
          const autoReadResult = await autoReadChannel(
            slackConfiguration.slackTeamId,
            logger,
            channel.id,
            providerType as "slack" | "slack_bot"
          );

          if (autoReadResult.isOk()) {
            if (autoReadResult.value) {
              processedCount++;
              logger.info(
                {
                  connectorId: connector.id,
                  channelId: channel.id,
                  channelName: channel.name,
                },
                "Successfully processed channel with autoReadChannel"
              );
            }
          } else {
            errorCount++;
            logger.error(
              {
                connectorId: connector.id,
                channelId: channel.id,
                channelName: channel.name,
                error: autoReadResult.error.message,
              },
              "Failed to process channel with autoReadChannel"
            );
          }
        } catch (error) {
          errorCount++;
          logger.error(
            {
              connectorId: connector.id,
              channelId: channel.id,
              channelName: channel.name,
              error: normalizeError(error),
            },
            "Exception while processing channel with autoReadChannel"
          );
        }
      }

      logger.info(
        {
          connectorId: connector.id,
          total: allChannels.length,
          processed: processedCount,
          errors: errorCount,
        },
        "Auto-join channel operation completed"
      );

      return {
        total: allChannels.length,
        processed: processedCount,
      };
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

      const slackClient = await getSlackClient(connector.id);

      const remoteChannel = await getChannelById(
        slackClient,
        connector.id,
        args.channelId
      );
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

      const slackClient = await getSlackClient(connector.id);

      const remoteChannel = await getChannelById(
        slackClient,
        connector.id,
        args.channelId
      );
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

      const slackClient = await getSlackClient(connector.id);

      const remoteChannel = await getChannelById(
        slackClient,
        connector.id,
        args.channelId
      );
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

    case "skip-channel": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.channelId) {
        throw new Error("Missing --channelId argument");
      }
      if (!args.skipReason) {
        throw new Error("Missing --skipReason argument");
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

      const channel = await SlackChannel.findOne({
        where: {
          connectorId: connector.id,
          slackChannelId: args.channelId,
        },
      });

      if (!channel) {
        throw new Error(`Channel ${args.channelId} not found in database`);
      }

      await channel.update({
        skipReason: args.skipReason,
      });

      logger.info(
        `Channel ${args.channelId} (${channel.slackChannelName}) will now be skipped with reason: ${args.skipReason}`
      );

      // If the channel was previously synced, we should garbage collect it
      if (["read", "read_write"].includes(channel.permission)) {
        const workflowRes = await launchSlackGarbageCollectWorkflow(
          connector.id
        );
        if (workflowRes.isErr()) {
          logger.warn(
            `Could not launch garbage collect workflow after skipping channel ${args.channelId}: ${workflowRes.error}`
          );
        }
      }

      return { success: true };
    }

    case "unskip-channel": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
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

      const channel = await SlackChannel.findOne({
        where: {
          connectorId: connector.id,
          slackChannelId: args.channelId,
        },
      });

      if (!channel) {
        throw new Error(`Channel ${args.channelId} not found in database`);
      }

      const previousSkipReason = channel.skipReason;

      if (!previousSkipReason) {
        throw new Error(
          `Channel ${args.channelId} (${channel.slackChannelName}) is not skipped`
        );
      }

      await channel.update({
        skipReason: null,
      });

      logger.info(
        `Channel ${args.channelId} (${channel.slackChannelName}) is no longer skipped (was: ${previousSkipReason})`
      );

      // If the channel has sync permissions, trigger a sync
      if (["read", "read_write"].includes(channel.permission)) {
        const workflowRes = await launchSlackSyncWorkflow(connector.id, null, [
          channel.slackChannelId,
        ]);
        if (workflowRes.isErr()) {
          logger.warn(
            `Could not launch sync workflow after unskipping channel ${args.channelId}: ${workflowRes.error}`
          );
        } else {
          logger.info(
            `Launched sync workflow for unskipped channel ${args.channelId}`
          );
        }
      }

      return { success: true };
    }

    case "cutover-legacy-bot": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }

      const legacyConnector = await ConnectorResource.findByWorkspaceIdAndType(
        args.wId,
        "slack"
      );
      if (!legacyConnector) {
        throw new Error(
          `Could not find Slack connector for workspace ${args.wId}`
        );
      }

      const slackConfiguration =
        await SlackConfigurationResource.fetchByConnectorId(legacyConnector.id);

      // Ensure that the legacy bot is not enabled anymore.
      if (!slackConfiguration || slackConfiguration.botEnabled) {
        throw new Error("Legacy bot is enabled");
      }

      const slackBotConnector =
        await ConnectorResource.findByWorkspaceIdAndType(args.wId, "slack_bot");
      if (!slackBotConnector) {
        throw new Error(
          `Could not find Slack bot connector for workspace ${args.wId}`
        );
      }

      const slackBotConfiguration =
        await SlackConfigurationResource.fetchByConnectorId(
          slackBotConnector.id
        );

      // Ensure that the new bot is enabled.
      if (!slackBotConfiguration?.botEnabled) {
        throw new Error("Slack bot is not enabled");
      }

      await launchSlackMigrateChannelsFromLegacyBotToNewBotWorkflow(
        legacyConnector.id,
        slackBotConnector.id
      );

      return { success: true };
    }

    default:
      throw new Error("Unknown slack command: " + command);
  }
};
