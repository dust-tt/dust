import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { WebClient } from "@slack/web-api";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { getSlackAccessToken } from "@connectors/connectors/slack/lib/slack_client";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackLabsConfigurationResource } from "@connectors/resources/slack_labs_configuration_resource";
import type {
  ContentNode,
  DataSourceConfig,
  SlackLabsConfigurationType,
} from "@connectors/types";

export class SlackLabsConnectorManager extends BaseConnectorManager<SlackLabsConfigurationType> {
  readonly provider: ConnectorProvider = "slack_labs";

  static async create({
    dataSourceConfig,
    connectionId,
    configuration,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
    configuration: SlackLabsConfigurationType;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    let accessToken: string;
    try {
      accessToken = await getSlackAccessToken(connectionId);
      if (!accessToken) {
        throw new Error("No access token received");
      }
    } catch (error) {
      logger.error({ connectionId, error }, "Failed to get Slack access token");
      throw new Error(`Failed to authenticate with Slack: ${error}`);
    }

    // Initialize Slack client and get team info
    const slackClient = new WebClient(accessToken);
    let teamInfo;
    try {
      teamInfo = await slackClient.team.info();
    } catch (error) {
      logger.error({ connectionId, error }, "Failed to call Slack API");
      throw new Error(`Failed to connect to Slack API: ${error}`);
    }

    if (teamInfo.ok !== true) {
      const errorMsg = teamInfo.error || "unknown";
      logger.error(
        { connectionId, error: errorMsg },
        "Slack API returned error"
      );
      throw new Error(`Slack API error: ${errorMsg}`);
    }

    if (!teamInfo.team?.id) {
      logger.error({ connectionId, teamInfo }, "Missing team ID in response");
      throw new Error("Could not retrieve Slack team ID");
    }

    const slackTeamId = teamInfo.team.id;

    // Validate required parameters
    if (!dataSourceConfig.workspaceAPIKey) {
      logger.error({ dataSourceConfig }, "Missing workspace API key");
      throw new Error("Missing workspace API key");
    }

    let connector;
    try {
      connector = await ConnectorResource.makeNew(
        "slack_labs",
        {
          connectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
        },
        {
          channelId: configuration.channelId,
          agentConfigurationId: configuration.agentConfigurationId,
          isEnabled: configuration.isEnabled,
          slackTeamId,
        }
      );
    } catch (error) {
      logger.error(
        {
          connectionId,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
          error,
        },
        "Failed to create slack_labs connector"
      );
      throw new Error(`Failed to create connector: ${error}`);
    }

    logger.info(
      {
        connectorId: connector.id,
        slackTeamId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      "Successfully created slack_labs connector"
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

    const currentSlackLabsConfig =
      await SlackLabsConfigurationResource.fetchByConnectorId(this.connectorId);
    if (!currentSlackLabsConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "SlackLabs configuration not found"
      );
      throw new Error(
        `SlackLabs configuration not found for connector ${this.connectorId}`
      );
    }

    const updateParams: Parameters<typeof c.update>[0] = {};

    if (connectionId) {
      const accessToken = await getSlackAccessToken(connectionId);
      const slackClient = new WebClient(accessToken);

      const teamInfoRes = await slackClient.team.info();
      if (!teamInfoRes.ok || !teamInfoRes.team?.id) {
        return new Err(
          new ConnectorManagerError(
            "INVALID_CONFIGURATION",
            "Can't get the Slack team information."
          )
        );
      }

      const newTeamId = teamInfoRes.team.id;
      if (newTeamId !== currentSlackLabsConfig.slackTeamId) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change the Slack Team of a Labs Data Source"
          )
        );
      }

      updateParams.connectionId = connectionId;
    }

    await c.update(updateParams);

    return new Ok(c.id.toString());
  }

  async configure({
    configuration,
  }: {
    configuration: SlackLabsConfigurationType;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(new Error("Connector not found"));
    }

    const slackLabsConfig =
      await SlackLabsConfigurationResource.fetchByConnectorId(connector.id);
    if (!slackLabsConfig) {
      return new Err(new Error("SlackLabs configuration not found"));
    }

    await slackLabsConfig.updateConfiguration({
      channelId: configuration.channelId,
      agentConfigurationId: configuration.agentConfigurationId,
      isEnabled: configuration.isEnabled,
    });

    return new Ok(undefined);
  }

  private async getSlackLabsConfiguration(): Promise<
    Result<SlackLabsConfigurationResource, Error>
  > {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    const slackLabsConfig =
      await SlackLabsConfigurationResource.fetchByConnectorId(this.connectorId);
    if (!slackLabsConfig) {
      return new Err(
        new Error(
          `SlackLabs configuration not found for connector ${this.connectorId}`
        )
      );
    }

    return new Ok(slackLabsConfig);
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    const configResult = await this.getSlackLabsConfiguration();
    if (configResult.isErr()) {
      return configResult;
    }
    const slackLabsConfig = configResult.value;

    const updateData: {
      channelId: string;
      agentConfigurationId: string;
      isEnabled: boolean;
    } = {
      channelId: slackLabsConfig.channelId,
      agentConfigurationId: slackLabsConfig.agentConfigurationId,
      isEnabled: slackLabsConfig.isEnabled,
    };

    switch (configKey) {
      case "isEnabled":
        updateData.isEnabled = configValue === "true";
        break;
      case "channelId":
        updateData.channelId = configValue;
        break;
      case "agentConfigurationId":
        updateData.agentConfigurationId = configValue;
        break;
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }

    await slackLabsConfig.updateConfiguration(updateData);
    return new Ok(undefined);
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    const configResult = await this.getSlackLabsConfiguration();
    if (configResult.isErr()) {
      return configResult;
    }
    const slackLabsConfig = configResult.value;

    switch (configKey) {
      case "isEnabled": {
        return new Ok(slackLabsConfig.isEnabled.toString());
      }

      case "channelId": {
        return new Ok(slackLabsConfig.channelId);
      }

      case "agentConfigurationId": {
        return new Ok(slackLabsConfig.agentConfigurationId);
      }

      case "slackTeamId": {
        return new Ok(slackLabsConfig.slackTeamId);
      }

      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async clean(): Promise<Result<undefined, Error>> {
    // No actual data source cleanup needed since we don't index content
    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    // No ongoing processes to stop for Labs connector
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    // No processes to resume for Labs connector
    return new Ok(undefined);
  }

  async sync(): Promise<Result<string, Error>> {
    // Labs connector doesn't sync data - it responds to real-time events
    return new Ok("No sync needed for slack_labs connector");
  }

  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    // Labs connector doesn't manage permissions or content nodes
    return new Ok([]);
  }

  async retrieveContentNodeParents(): Promise<Result<string[], Error>> {
    // Labs connector doesn't have content node hierarchy
    return new Ok([]);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    // Labs connector doesn't manage permissions
    return new Ok(undefined);
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    // No garbage collection needed for Labs connector
    return new Ok("No garbage collection needed for slack_labs connector");
  }
}
