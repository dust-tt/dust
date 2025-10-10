import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type {
  ConnectorManagerError,
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { DiscordConfigurationResource } from "@connectors/resources/discord_configuration_resource";
import type {
  ContentNode,
  DataSourceConfig,
  DiscordBotConfigurationType,
} from "@connectors/types";
import { withTransaction } from "@connectors/types/shared/utils/sql_utils";

export class DiscordBotConnectorManager extends BaseConnectorManager<DiscordBotConfigurationType> {
  readonly provider: ConnectorProvider = "discord_bot";

  static async create({
    dataSourceConfig,
    connectionId,
    configuration,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
    configuration: DiscordBotConfigurationType;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const connectionData = await getOAuthConnectionAccessTokenWithThrow({
      logger,
      provider: "discord",
      connectionId,
    });

    const guildId = connectionData.connection.metadata.guild_id;
    if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId)) {
      logger.error(
        { connectionId, guildId },
        "Invalid guild ID in OAuth connection metadata"
      );
      throw new Error(`Invalid guild ID for connectionId: ${connectionId}`);
    }

    const connector = await withTransaction(async (transaction) => {
      const connector = await ConnectorResource.makeNew(
        "discord_bot",
        {
          connectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
        },
        {
          botEnabled: configuration.botEnabled,
          guildId,
        },
        transaction
      );

      logger.info(
        {
          connectorId: connector.id,
          workspaceId: dataSourceConfig.workspaceId,
          guildId,
        },
        "Created Discord bot connector"
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

    const currentDiscordConfig =
      await DiscordConfigurationResource.fetchByConnectorId(this.connectorId);
    if (!currentDiscordConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Discord configuration not found"
      );
      throw new Error(
        `Discord configuration not found for connector ${this.connectorId}`
      );
    }

    const updateParams: Parameters<typeof c.update>[0] = {};

    if (connectionId) {
      updateParams.connectionId = connectionId;
    }

    if (Object.keys(updateParams).length > 0) {
      await c.update(updateParams);
      logger.info(
        {
          connectorId: this.connectorId,
        },
        "Updated Discord bot connector"
      );
    } else {
      logger.info(
        { connectorId: this.connectorId },
        "Discord bot connector update called (no changes needed)"
      );
    }

    return new Ok(this.connectorId.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Failed to delete Discord bot connector"
      );
      return res;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    return new Ok(undefined);
  }

  async sync(): Promise<Result<string, Error>> {
    return new Ok("discord-bot-no-sync");
  }

  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    return new Ok([]);
  }

  async retrieveContentNodeParents(): Promise<Result<string[], Error>> {
    return new Ok([]);
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

    const discordConfig = await DiscordConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!discordConfig) {
      return new Err(
        new Error(
          `Discord configuration not found for connector ${this.connectorId}`
        )
      );
    }

    switch (configKey) {
      case "botEnabled": {
        if (configValue === "true") {
          return discordConfig.enableBot();
        } else {
          return discordConfig.disableBot();
        }
      }

      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
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
        const discordConfig =
          await DiscordConfigurationResource.fetchByConnectorId(
            this.connectorId
          );
        if (!discordConfig) {
          return new Err(
            new Error(
              `Discord configuration not found for connector ${this.connectorId}`
            )
          );
        }
        return new Ok(discordConfig.botEnabled.toString());
      }

      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    return new Ok("no-op");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
