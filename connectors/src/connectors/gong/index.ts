import type { ContentNode, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";

import type {
  ConnectorManagerError,
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export class GongConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const connector = await ConnectorResource.makeNew(
      "gong",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {}
    );

    return new Ok(connector.id.toString());
  }

  async update(): Promise<
    Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>
  > {
    throw new Error("Method not implemented.");
  }

  async clean(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async stop(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async resume(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async sync(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    throw new Error("Method not implemented.");
  }

  async setPermissions(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method not implemented.");
  }

  async pause(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Gong] Connector not found.");
      throw new Error("[Gong] Connector not found.");
    }
    await connector.markAsPaused();
    return this.stop();
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Gong] Connector not found.");
      throw new Error("[Gong] Connector not found.");
    }
    await connector.markAsUnpaused();
    return this.resume();
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
