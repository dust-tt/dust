import {
  launchDustProjectFullSyncWorkflow,
  launchDustProjectIncrementalSyncWorkflow,
  stopDustProjectSyncWorkflow,
} from "@connectors/connectors/dust_project/temporal/client";
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
import { DustProjectConfigurationResource } from "@connectors/resources/dust_project_configuration_resource";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  DataSourceConfig,
} from "@connectors/types";
import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

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

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async stop({
    reason,
  }: {
    reason: string;
  }): Promise<Result<undefined, Error>> {
    return stopDustProjectSyncWorkflow({
      connectorId: this.connectorId,
      stopReason: reason,
    });
  }

  async resume(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(new Error(`Connector ${this.connectorId} not found`));
    }

    // Check if there has been a successful sync
    const configuration =
      await DustProjectConfigurationResource.fetchByConnectorId(
        this.connectorId
      );
    if (!configuration) {
      return new Err(
        new Error(`Configuration not found for connector ${this.connectorId}`)
      );
    }

    // If no successful sync yet, start with full sync
    // Otherwise, launch incremental sync workflow with cron schedule
    if (!configuration.lastSyncedAt) {
      logger.info(
        { connectorId: this.connectorId },
        "No previous sync found, launching full sync"
      );
      const result = await launchDustProjectFullSyncWorkflow(this.connectorId);
      if (result.isErr()) {
        return new Err(result.error);
      }
      return new Ok(undefined);
    } else {
      logger.info(
        { connectorId: this.connectorId },
        "Previous sync found, launching incremental sync workflow"
      );
      const result = await launchDustProjectIncrementalSyncWorkflow(
        this.connectorId
      );
      if (result.isErr()) {
        return new Err(result.error);
      }
      return new Ok(undefined);
    }
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    // Launch full sync if fromTs is null, otherwise incremental sync
    if (fromTs === null) {
      return launchDustProjectFullSyncWorkflow(this.connectorId);
    } else {
      return launchDustProjectIncrementalSyncWorkflow(this.connectorId);
    }
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement this.
    return new Ok([internalId]);
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async setPermissions({
    permissions: _permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    // No-op: inherits project permissions
    return new Ok(undefined);
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async getConfigurationKey({
    configKey: _configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    // No configuration keys for dust_project
    return new Ok(null);
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async configure(): Promise<Result<void, Error>> {
    return new Err(new Error("Not implemented for this connector type"));
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async garbageCollect(): Promise<Result<string, Error>> {
    // Garbage collection is now handled automatically during sync
    // Deleted conversations are detected and removed during full and incremental syncs
    return new Err(
      new Error(
        "Garbage collection is no longer needed - deleted conversations are handled during sync"
      )
    );
  }
}
