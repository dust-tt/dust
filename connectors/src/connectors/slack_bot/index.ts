import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import {
  getAutoReadChannelPatterns,
  getRestrictedSpaceAgentsEnabled,
  uninstallSlack,
} from "@connectors/connectors/slack";
import { getBotEnabled } from "@connectors/connectors/slack/bot";
import { getJoinedChannels } from "@connectors/connectors/slack/lib/channels";
import { retrievePermissions } from "@connectors/connectors/slack/lib/retrieve_permissions";
import {
  getSlackAccessToken,
  getSlackClient,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import { launchSlackMigrateChannelsFromLegacyBotToNewBotWorkflow } from "@connectors/connectors/slack/temporal/client";
import {
  SlackBotWhitelistModel,
  SlackChannel,
} from "@connectors/lib/models/slack";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type {
  ConnectorPermission,
  ContentNode,
  DataSourceConfig,
  SlackConfigurationType,
} from "@connectors/types";
import { isSlackAutoReadPatterns, safeParseJSON } from "@connectors/types";
import { withTransaction } from "@connectors/types/shared/utils/sql_utils";

const { SLACK_BOT_CLIENT_ID, SLACK_BOT_CLIENT_SECRET } = process.env;

export class SlackBotConnectorManager extends BaseConnectorManager<SlackConfigurationType> {
  readonly provider: ConnectorProvider = "slack_bot";

  static async create({
    dataSourceConfig,
    connectionId,
    configuration,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
    configuration: SlackConfigurationType;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const accessToken = await getSlackAccessToken(connectionId);
    const slackClient = await getSlackClient(accessToken);

    const teamInfo = await slackClient.team.info();
    if (teamInfo.ok !== true) {
      throw new Error(
        `Could not get slack team info. Error message: ${
          teamInfo.error || "unknown"
        }`
      );
    }
    if (!teamInfo.team?.id) {
      throw new Error(
        `Could not get slack team id. Error message: ${
          teamInfo.error || "unknown"
        }`
      );
    }
    const slackTeamId = teamInfo.team.id;
    const legacyConnector = await ConnectorResource.findByWorkspaceIdAndType(
      dataSourceConfig.workspaceId,
      "slack"
    );
    const legacyConfiguration =
      legacyConnector?.configuration as SlackConfigurationResource;
    const connector = await withTransaction(async (transaction) => {
      const connector = await ConnectorResource.makeNew(
        "slack_bot",
        {
          connectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
        },
        {
          ...(legacyConfiguration
            ? {
                autoReadChannelPatterns:
                  legacyConfiguration.autoReadChannelPatterns,
                whitelistedDomains: legacyConfiguration.whitelistedDomains,
                restrictedSpaceAgentsEnabled:
                  legacyConfiguration.restrictedSpaceAgentsEnabled,
              }
            : {
                autoReadChannelPatterns: configuration.autoReadChannelPatterns,
                whitelistedDomains: configuration.whitelistedDomains,
                restrictedSpaceAgentsEnabled:
                  configuration.restrictedSpaceAgentsEnabled ?? true,
              }),
          botEnabled: configuration.botEnabled,
          slackTeamId,
        },
        transaction
      );

      // Track migration results for recap log
      let channelsMigrated = 0;
      let channelsMigrationStatus = "not_attempted";
      let channelsMigrationSkipReason = null;

      logger.info(
        {
          connectorId: connector.id,
          workspaceId: dataSourceConfig.workspaceId,
          slackTeamId,
        },
        "Starting auto-migration from legacy Slack connector"
      );

      if (legacyConnector) {
        const slackBotChannelsCount = await SlackChannel.count({
          where: {
            connectorId: connector.id,
          },
        });
        if (
          slackBotChannelsCount === 0 // Ensure slack_bot connector has no channels
        ) {
          // Migrate channels from legacy slack connector to keep default bot per Slack channel
          // functionality
          const slackChannels = await SlackChannel.findAll({
            where: {
              connectorId: legacyConnector.id,
              // Only migrate channels with agent configuration
              agentConfigurationId: { [Op.ne]: null },
            },
          });

          if (slackChannels.length > 0) {
            const creationRecords = slackChannels.map(
              (channel): CreationAttributes<SlackChannel> => ({
                connectorId: connector.id, // Update to slack_bot connector ID
                createdAt: channel.createdAt, // Keep the original createdAt field
                updatedAt: channel.updatedAt, // Keep the original updatedAt field
                slackChannelId: channel.slackChannelId,
                slackChannelName: channel.slackChannelName,
                skipReason: channel.skipReason,
                private: channel.private,
                permission: "write", // Set permission to write
                agentConfigurationId: channel.agentConfigurationId,
              })
            );
            await SlackChannel.bulkCreate(creationRecords, { transaction });

            channelsMigrated = slackChannels.length;
            channelsMigrationStatus = "success";
          } else {
            channelsMigrationStatus = "skipped";
            channelsMigrationSkipReason = "no_channels_with_agent_config";
          }
        } else {
          channelsMigrationStatus = "skipped";
          channelsMigrationSkipReason = "connector_already_has_channels";
        }
      }
      // Track whitelist model migration results for recap log
      let whitelistModelsMigrated = 0;
      let whitelistMigrationStatus = "not_attempted";

      if (legacyConfiguration && connector.configuration) {
        const slackBotWhitelistModelCount = await SlackBotWhitelistModel.count({
          where: {
            connectorId: legacyConfiguration.connectorId,
          },
        });
        if (slackBotWhitelistModelCount > 0) {
          // Migrate SlackBotWhitelistModel from legacy slack connector
          const slackBotWhitelistModels = await SlackBotWhitelistModel.findAll({
            where: {
              connectorId: legacyConfiguration.connectorId,
            },
          });
          const slackConfigurationId = connector.configuration.id;
          const whitelistRecords = slackBotWhitelistModels.map(
            (whitelistModel) => {
              return {
                createdAt: whitelistModel.createdAt,
                updatedAt: whitelistModel.updatedAt,
                botName: whitelistModel.botName,
                groupIds: whitelistModel.groupIds,
                whitelistType: whitelistModel.whitelistType,
                connectorId: connector.id,
                slackConfigurationId,
              };
            }
          );
          await SlackBotWhitelistModel.bulkCreate(whitelistRecords, {
            transaction,
          });

          whitelistModelsMigrated = slackBotWhitelistModelCount;
          whitelistMigrationStatus = "success";
        } else {
          whitelistMigrationStatus = "skipped";
        }
      }

      // Single recap log for Datadog monitoring
      logger.info(
        {
          connectorId: connector.id,
          workspaceId: dataSourceConfig.workspaceId,
          slackTeamId,
          botEnabled: configuration.botEnabled,
          hasLegacyConnector: !!legacyConnector,
          legacyConnectorId: legacyConnector?.id || null,
          configurationSource: legacyConfiguration ? "legacy" : "new",
          channelsMigrationStatus,
          channelsMigrationSkipReason,
          channelsMigrated,
          whitelistMigrationStatus,
          whitelistModelsMigrated,
        },
        "Auto-migration recap after Slack bot connector creation"
      );

      return connector;
    });

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    const currentSlackConfig =
      await SlackConfigurationResource.fetchByConnectorId(this.connectorId);
    if (!currentSlackConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Slack configuration not found"
      );
      throw new Error(
        `Slack configuration not found for connector ${this.connectorId}`
      );
    }

    const updateParams: Parameters<typeof c.update>[0] = {};

    if (connectionId) {
      const accessToken = await getSlackAccessToken(connectionId);
      const slackClient = await getSlackClient(accessToken);

      reportSlackUsage({
        connectorId: c.id,
        method: "team.info",
      });
      const teamInfoRes = await slackClient.team.info();
      if (!teamInfoRes.ok || !teamInfoRes.team?.id) {
        throw new Error("Can't get the Slack team information.");
      }

      const newTeamId = teamInfoRes.team.id;
      if (newTeamId !== currentSlackConfig.slackTeamId) {
        const configurations =
          await SlackConfigurationResource.listForTeamId(newTeamId);

        // Revoke the token if no other slack connector is active on the same slackTeamId.
        if (configurations.length == 0) {
          logger.info(
            {
              connectorId: c.id,
              slackTeamId: newTeamId,
              connectionId: connectionId,
            },
            `Attempting Slack app deactivation [updateSlackConnector/team_id_mismatch]`
          );
          const uninstallRes = await uninstallSlack(
            connectionId,
            SLACK_BOT_CLIENT_ID,
            SLACK_BOT_CLIENT_SECRET
          );

          if (uninstallRes.isErr()) {
            throw new Error("Failed to deactivate the mismatching Slack app");
          }
          logger.info(
            {
              connectorId: c.id,
              slackTeamId: newTeamId,
              connectionId: connectionId,
            },
            `Deactivated Slack app [updateSlackConnector/team_id_mismatch]`
          );
        } else {
          logger.info(
            {
              slackTeamId: newTeamId,
              activeConfigurations: configurations.length,
            },
            `Skipping deactivation of the Slack app [updateSlackConnector/team_id_mismatch]`
          );
        }

        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change the Slack Team of a Data Source"
          )
        );
      }

      updateParams.connectionId = connectionId;
    }

    await c.update(updateParams);

    return new Ok(c.id.toString());
  }

  async clean({
    force,
  }: {
    force: boolean;
  }): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    const configuration = await SlackConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!configuration) {
      return new Err(
        new Error(
          `Could not find configuration for connector id ${this.connectorId}`
        )
      );
    }

    const configurations = await SlackConfigurationResource.listForTeamId(
      configuration.slackTeamId
    );

    // We deactivate our connections only if we are the only live slack connection for this team.
    if (configurations.length == 1) {
      logger.info(
        {
          connectorId: connector.id,
          slackTeamId: configuration.slackTeamId,
          connectionId: connector.connectionId,
        },
        `Attempting Slack app deactivation [cleanupSlackConnector]`
      );

      try {
        const uninstallRes = await uninstallSlack(
          connector.connectionId,
          SLACK_BOT_CLIENT_ID,
          SLACK_BOT_CLIENT_SECRET
        );

        if (uninstallRes.isErr() && !force) {
          return uninstallRes;
        }
      } catch (e) {
        if (!force) {
          throw e;
        }
      }

      logger.info(
        {
          connectorId: connector.id,
          slackTeamId: configuration.slackTeamId,
        },
        `Deactivated Slack app [cleanupSlackConnector]`
      );
    } else {
      logger.info(
        {
          connectorId: connector.id,
          slackTeamId: configuration.slackTeamId,
          activeConfigurations: configurations.length - 1,
        },
        `Skipping deactivation of the Slack app [cleanupSlackConnector]`
      );
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Slack connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async sync(): Promise<Result<string, Error>> {
    return new Ok("slack-bot-no-sync");
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    return retrievePermissions({
      connectorId: this.connectorId,
      parentInternalId,
      filterPermission,
      getFilteredChannels,
    });
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    return new Ok([internalId]);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    return new Ok(undefined);
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!slackConfig) {
      return new Err(
        new Error(
          `Slack configuration not found for connector ${this.connectorId}`
        )
      );
    }

    switch (configKey) {
      case "botEnabled": {
        if (configValue === "true") {
          const res = await slackConfig.enableBot();
          if (res.isErr()) {
            return res;
          }

          const legacySlackConnector =
            await ConnectorResource.findByWorkspaceIdAndType(
              connector.workspaceId,
              "slack"
            );
          if (!legacySlackConnector) {
            return new Err(new Error("Legacy Slack connector not found"));
          }

          await launchSlackMigrateChannelsFromLegacyBotToNewBotWorkflow(
            legacySlackConnector.id,
            this.connectorId
          );

          return res;
        } else {
          return slackConfig.disableBot();
        }
      }

      case "autoReadChannelPatterns": {
        const parsedConfig = safeParseJSON(configValue);
        if (parsedConfig.isErr()) {
          return new Err(parsedConfig.error);
        }

        const autoReadChannelPatterns = parsedConfig.value;
        if (!Array.isArray(autoReadChannelPatterns)) {
          return new Err(
            new Error("autoReadChannelPatterns must be an array of objects")
          );
        }

        if (!isSlackAutoReadPatterns(autoReadChannelPatterns)) {
          return new Err(
            new Error(
              "autoReadChannelPatterns must be an array of objects with pattern and spaceId"
            )
          );
        }

        return slackConfig.setAutoReadChannelPatterns(autoReadChannelPatterns);
      }

      case "restrictedSpaceAgentsEnabled": {
        const enabled = configValue === "true";
        await slackConfig.model.update(
          { restrictedSpaceAgentsEnabled: enabled },
          { where: { id: slackConfig.id } }
        );
        return new Ok(undefined);
      }

      default: {
        return new Err(new Error(`Invalid config key ${configKey}`));
      }
    }
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    switch (configKey) {
      case "botEnabled": {
        const botEnabledRes = await getBotEnabled(this.connectorId);
        if (botEnabledRes.isErr()) {
          return botEnabledRes;
        }
        return new Ok(botEnabledRes.value.toString());
      }

      case "autoReadChannelPatterns": {
        const autoReadChannelPatterns = await getAutoReadChannelPatterns(
          this.connectorId
        );

        return autoReadChannelPatterns;
      }

      case "restrictedSpaceAgentsEnabled": {
        const restrictedSpaceAgentsEnabled =
          await getRestrictedSpaceAgentsEnabled(this.connectorId);
        return restrictedSpaceAgentsEnabled;
      }

      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async stop(): Promise<Result<undefined, Error>> {
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    return new Ok(undefined);
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}

async function getFilteredChannels(
  connectorId: number,
  filterPermission: ConnectorPermission | null
) {
  const slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    permission: ConnectorPermission;
    private: boolean;
  }[] = [];

  if (
    filterPermission &&
    (filterPermission === "read" || filterPermission === "read_write")
  ) {
    // When requesting only read or read_write permissions, return empty array
    return slackChannels;
  }

  const slackClient = await getSlackClient(connectorId);

  const [remoteChannels, localChannels] = await Promise.all([
    getJoinedChannels(slackClient, connectorId),
    SlackChannel.findAll({
      where: {
        connectorId,
        // Here we do not filter out channels with skipReason because we need to know the ones that
        // are skipped.
      },
    }),
  ]);

  const localChannelsById = localChannels.reduce(
    (acc: Record<string, SlackChannel>, ch: SlackChannel) => {
      acc[ch.slackChannelId] = ch;
      return acc;
    },
    {} as Record<string, SlackChannel>
  );

  for (const remoteChannel of remoteChannels) {
    if (!remoteChannel.id || !remoteChannel.name) {
      continue;
    }

    const localChannel = localChannelsById[remoteChannel.id];

    // Skip channels with skipReason
    if (localChannel?.skipReason) {
      continue;
    }

    // Skip private channels as the Slack ToS prevents showing private channels from Admin A to
    // admin B.
    if (remoteChannel.is_private) {
      continue;
    }

    slackChannels.push({
      slackChannelId: remoteChannel.id,
      slackChannelName: remoteChannel.name,
      permission: "write",
      // Private channels are returned by the API and generally filtered client-side unless gated in
      // `index_private_slack_channels`.
      private: !!remoteChannel.is_private,
    });
  }
  return slackChannels;
}
