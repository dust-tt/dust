import type { ContentNode, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";

import type {
  ConnectorManagerError,
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export class SalesforceConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const connector = await ConnectorResource.makeNew(
      "salesforce",
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

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    // TODO(salesforce): implement this

    void connectionId;

    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector ${this.connectorId} not found`);
    }
    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async stop(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async resume(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async sync(): Promise<Result<string, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async setPermissions(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async retrieveBatchContentNodes(): Promise<Result<ContentNode[], Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async retrieveContentNodeParents(): Promise<Result<string[], Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async pause(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async unpause(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async getConfigurationKey(): Promise<Result<string, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }

  async configure(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    throw new Error("Not implemented");
  }
}
