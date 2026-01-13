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
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  DataSourceConfig,
} from "@connectors/types";

export class DustProjectConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "dust_project";

  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    if (!connectionId) {
      return new Err(
        new ConnectorManagerError(
          "INVALID_CONFIGURATION",
          "connectionId is required for dust_project connector, it should be the project ID"
        )
      );
    }

    const projectId = connectionId;

    const connector = await ConnectorResource.makeNew(
      "dust_project",
      {
        connectionId: projectId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {
        projectId,
      }
    );

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId: _connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    // No update needed for dust_project connector
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector ${this.connectorId} not found`);
    }
    return new Ok(connector.id.toString());
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

  async stop({
    reason: _reason,
  }: {
    reason: string;
  }): Promise<Result<undefined, Error>> {
    return new Err(new Error("Not implemented yet"));
  }

  async resume(): Promise<Result<undefined, Error>> {
    return new Err(new Error("Not implemented yet"));
  }

  async sync({
    fromTs: _fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    // TODO: Trigger sync workflow
    return new Err(new Error("Sync not implemented yet"));
  }

  async retrievePermissions({
    parentInternalId: _parentInternalId,
    filterPermission: _filterPermission,
    viewType: _viewType,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    // No permissions to retrieve - all project conversations are accessible
    return new Ok([]);
  }

  async retrieveContentNodeParents({
    internalId: _internalId,
    memoizationKey: _memoizationKey,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement parent retrieval
    return new Err(new Error("Not implemented yet"));
  }

  async setPermissions({
    permissions: _permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    // No-op: inherits project permissions
    return new Ok(undefined);
  }

  async setConfigurationKey({
    configKey: _configKey,
    configValue: _configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    // No configuration keys for dust_project
    return new Ok(undefined);
  }

  async getConfigurationKey({
    configKey: _configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    // No configuration keys for dust_project
    return new Ok(null);
  }

  async configure(): Promise<Result<void, Error>> {
    return new Err(new Error("Not implemented for this connector type"));
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    // TODO: Implement garbage collection workflow
    return new Err(new Error("Not implemented yet"));
  }
}
