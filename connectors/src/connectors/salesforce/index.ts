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
import { getSalesforceCredentials } from "@connectors/connectors/salesforce/lib/oauth";
import {
  getSalesforceConnection,
  testSalesforceConnection,
} from "@connectors/connectors/salesforce/lib/salesforce_api";
import { getConnectorAndCredentials } from "@connectors/connectors/salesforce/lib/utils";
import { stopSalesforceSyncQueryWorkflow } from "@connectors/connectors/salesforce/temporal/client";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SalesforceSyncedQueryResource } from "@connectors/resources/salesforce_resources";
import type { DataSourceConfig } from "@connectors/types";
import type { ContentNode } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

const logger = mainLogger.child({
  connector: "salesforce",
});

export class SalesforceConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "salesforce";

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
    // The synced query workflow is lauched manually by us with a cli command once we've set up the query.
    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    // Get connector.
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    // If no connection ID is provided, we return the current connector ID.
    if (!connectionId) {
      return new Ok(connector.id.toString());
    }

    // Get credentials on the new connection.
    const credentialsRes = await getSalesforceCredentials(connectionId);
    if (credentialsRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          "INVALID_CONFIGURATION",
          credentialsRes.error.message
        )
      );
    }

    // Test connection on the new connection.
    const connectionRes = await testSalesforceConnection(credentialsRes.value);
    if (connectionRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          "INVALID_CONFIGURATION",
          connectionRes.error.message
        )
      );
    }

    const queries =
      await SalesforceSyncedQueryResource.fetchByConnector(connector);
    await Promise.all(
      queries.map((query) =>
        stopSalesforceSyncQueryWorkflow(connector.id, query.id)
      )
    );
    await connector.update({ connectionId });

    // We do not launch the workflow again - it has to be done manually with the cli command.
    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    await SalesforceSyncedQueryResource.deleteByConnectorId(connector.id);
    const res = await connector.delete();
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    const queries =
      await SalesforceSyncedQueryResource.fetchByConnector(connector);

    await Promise.all(
      queries.map((query) =>
        stopSalesforceSyncQueryWorkflow(connector.id, query.id)
      )
    );

    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    throw new Error("Method resume not implemented.");
  }

  async sync({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    throw new Error("Method sync not implemented.");
  }

  /**
   * For Salesforce the tree is:
   * Project > Standard Objects & Custom Objects > Objects.
   */
  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    // Get connector and credentials.
    const getConnectorAndCredentialsRes = await getConnectorAndCredentials(
      this.connectorId
    );
    if (getConnectorAndCredentialsRes.isErr()) {
      return new Err(getConnectorAndCredentialsRes.error);
    }
    const { credentials } = getConnectorAndCredentialsRes.value;

    // Get connection.
    const connRes = await getSalesforceConnection(credentials);
    if (connRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          "EXTERNAL_OAUTH_TOKEN_ERROR",
          "Salesforce authorization error, please re-authorize."
        )
      );
    }

    // We return a single fake node just to display the message in the UI instead of "No documents found".
    const node: ContentNode = {
      internalId: `salesforce-synced-query-root-${this.connectorId}`,
      parentInternalId: null,
      type: "folder",
      title: "Synced Queries are set by Dust - no permissions needed.",
      sourceUrl: null,
      expandable: false,
      preventSelection: false,
      permission: "read",
      lastUpdatedAt: null,
      mimeType: INTERNAL_MIME_TYPES.SALESFORCE.SYNCED_QUERY_FOLDER,
    };

    return new Ok([node]);
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement this.
    return new Ok([internalId]);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    // No permissions to set for Salesforce synced queries.
    return new Ok(undefined);
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    throw new Error("Method setConfigurationKey not implemented.");
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method getConfigurationKey not implemented.");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method garbageCollect not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method configure not implemented.");
  }
}
