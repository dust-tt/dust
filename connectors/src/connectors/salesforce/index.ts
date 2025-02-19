import type { ContentNode, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { getSalesforceCredentials } from "@connectors/connectors/salesforce/lib/oauth";
import { SalesforceConfigurationModel } from "@connectors/lib/models/salesforce";
import logger from "@connectors/logger/logger";
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
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    await SalesforceConfigurationModel.destroy({
      where: {
        connectorId: connector.id,
      },
    });

    const res = await connector.delete();
    if (res.isErr()) {
      return res;
    }

    // TODO(salesforce): implement this

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    // TODO(salesforce): implement this

    return new Ok(undefined);
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

    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const connectionId = c.connectionId;

    const { accessToken, instanceUrl } =
      await getSalesforceCredentials(connectionId);

    void accessToken;
    void instanceUrl;

    return new Ok([]);
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
