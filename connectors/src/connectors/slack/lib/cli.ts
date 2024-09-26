import type {
  AdminSuccessResponseType,
  SlackCommandType,
} from "@dust-tt/types";
import { isSlackbotWhitelistType } from "@dust-tt/types";

import {
  launchSlackSyncOneThreadWorkflow,
  launchSlackSyncWorkflow,
} from "@connectors/connectors/slack/temporal/client";
import { throwOnError } from "@connectors/lib/cli";
import { SlackChannel } from "@connectors/lib/models/slack";
import { default as topLogger } from "@connectors/logger/logger";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

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

    default:
      throw new Error("Unknown slack command: " + command);
  }
};
