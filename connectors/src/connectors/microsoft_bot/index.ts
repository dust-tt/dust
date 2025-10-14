import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type {
  ConnectorManagerError,
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { getClient } from "@connectors/connectors/microsoft";
import { getOrganization } from "@connectors/connectors/microsoft/lib/graph_api";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftBotConfigurationResource } from "@connectors/resources/microsoft_resource";
import type { ContentNode, DataSourceConfig } from "@connectors/types";

export class MicrosoftBotConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "microsoft_bot";

  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const client = await getClient(connectionId);

    const org = await getOrganization(logger, client);

    if (!org.id) {
      throw new Error("Could not retrieve Microsoft organization ID");
    }

    const connector = await ConnectorResource.makeNew(
      "microsoft_bot",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {
        botEnabled: true,
        tenantId: org.id,
      }
    );

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector not found. ConnectorId: ${this.connectorId}`);
    }

    if (connectionId) {
      await connector.update({ connectionId });
    }

    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "Microsoft Bot connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    try {
      // Clean up bot configuration
      const botConfig =
        await MicrosoftBotConfigurationResource.fetchByConnectorId(
          connector.id
        );
      if (botConfig) {
        await botConfig.delete();
      }

      // Delete the connector itself
      const res = await connector.delete();
      if (res.isErr()) {
        logger.error(
          { connectorId: this.connectorId, error: res.error },
          "Error cleaning up Microsoft Bot connector."
        );
        return res;
      }

      logger.info(
        { connectorId: this.connectorId },
        "Successfully cleaned up Microsoft Bot connector."
      );

      return new Ok(undefined);
    } catch (error) {
      logger.error(
        { connectorId: this.connectorId, error },
        "Error cleaning up Microsoft Bot connector."
      );
      return new Err(error as Error);
    }
  }

  async sync(): Promise<Result<string, Error>> {
    return new Ok("microsoft-bot-no-sync");
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
    const botConfig =
      await MicrosoftBotConfigurationResource.fetchByConnectorId(
        this.connectorId
      );

    if (!botConfig) {
      throw new Error(
        `Bot configuration not found for connector ${this.connectorId}`
      );
    }

    switch (configKey) {
      case "botEnabled":
        await botConfig.update({ botEnabled: configValue === "true" });
        break;
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }

    return new Ok(undefined);
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    const botConfig =
      await MicrosoftBotConfigurationResource.fetchByConnectorId(
        this.connectorId
      );

    if (!botConfig) {
      throw new Error(
        `Bot configuration not found for connector ${this.connectorId}`
      );
    }

    switch (configKey) {
      case "botEnabled":
        return new Ok(botConfig.botEnabled.toString());
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
