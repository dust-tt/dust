import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

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
import {
  getSlackAccessToken,
  getSlackClient,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ContentNode, SlackConfigurationType } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { isSlackAutoReadPatterns, safeParseJSON } from "@connectors/types";

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
    const slackClient = await getSlackClient(accessToken, {
      // Do not reject rate limited calls in update connector. Called from the API.
      rejectRateLimitedCalls: false,
    });

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
    const connector = await ConnectorResource.makeNew(
      "slack_bot",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {
        autoReadChannelPatterns: configuration.autoReadChannelPatterns,
        botEnabled: true,
        slackTeamId: teamInfo.team.id,
        whitelistedDomains: configuration.whitelistedDomains,
        restrictedSpaceAgentsEnabled:
          configuration.restrictedSpaceAgentsEnabled ?? true,
      }
    );

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
      const slackClient = await getSlackClient(accessToken, {
        // Do not reject rate limited calls in update connector. Called from the API.
        rejectRateLimitedCalls: false,
      });

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

  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    return new Ok([]);
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
          return slackConfig.enableBot();
        } else {
          return new Err(
            new Error("SlackBot configuration assumes slack bot is enabled")
          );
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
