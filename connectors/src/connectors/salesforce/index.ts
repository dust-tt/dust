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
import {
  launchSalesforceSyncWorkflow,
  stopSalesforceSyncQueryWorkflow,
  stopSalesforceSyncWorkflow,
} from "@connectors/connectors/salesforce/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
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

    const launchRes = await launchSalesforceSyncWorkflow(connector.id);
    if (launchRes.isErr()) {
      throw launchRes.error;
    }

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
        stopSalesforceSyncQueryWorkflow({
          connectorId: connector.id,
          queryId: query.id,
          stopReason: "Stopped to update connector configuration",
        })
      )
    );
    await connector.update({ connectionId });

    // We launch the workflow again so it syncs immediately.
    await launchSalesforceSyncWorkflow(connector.id);

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
        stopSalesforceSyncQueryWorkflow({
          connectorId: connector.id,
          queryId: query.id,
          stopReason: "Stopped via connector STOP command",
        })
      )
    );
    const stopRes = await stopSalesforceSyncWorkflow({
      connectorId: this.connectorId,
      stopReason: "Stopped via connector STOP command",
    });
    if (stopRes.isErr()) {
      return stopRes;
    }

    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);

    if (!connector) {
      logger.error(
        {
          connectorId: this.connectorId,
        },
        "BigQuery connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    try {
      const launchRes = await launchSalesforceSyncWorkflow(connector.id);
      if (launchRes.isErr()) {
        logger.error(
          {
            workspaceId: dataSourceConfig.workspaceId,
            dataSourceId: dataSourceConfig.dataSourceId,
            error: launchRes.error,
          },
          "Error launching Salesforce sync workflow."
        );
        return launchRes;
      }
    } catch (e) {
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
          error: e,
        },
        "Error launching Salesforce sync workflow."
      );
    }

    return new Ok(undefined);
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    logger.info({ fromTs }, "To be implemented");
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
    const { connector, credentials } = getConnectorAndCredentialsRes.value;

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

    const queries =
      await SalesforceSyncedQueryResource.fetchByConnector(connector);

    return new Ok(
      queries.map((query) => {
        return {
          internalId: `salesforce-synced-query-${connector.id}-${query.id}`,
          parentInternalId: null,
          type: "folder",
          title: `[Synced Query] ${query.rootNodeName}`,
          sourceUrl: null,
          expandable: false,
          preventSelection: true,
          permission: "read",
          lastUpdatedAt: null,
          mimeType: INTERNAL_MIME_TYPES.SALESFORCE.SYNCED_QUERY_FOLDER,
        };
      })
    );
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
    return new Err(new Error("Synced Queries are managed by Dust"));
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
