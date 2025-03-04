import type { ConnectorPermission, ContentNode, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

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
  fetchAvailableChildrenInSalesforce,
  fetchReadNodes,
  fetchSyncedChildren,
} from "@connectors/connectors/salesforce/lib/permissions";
import {
  getSalesforceConnection,
  testSalesforceConnection,
} from "@connectors/connectors/salesforce/lib/salesforce_api";
import { getConnectorAndCredentials } from "@connectors/connectors/salesforce/lib/utils";
import {
  launchSalesforceSyncWorkflow,
  stopSalesforceSyncWorkflow,
} from "@connectors/connectors/salesforce/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import { SalesforceConfigurationModel } from "@connectors/lib/models/salesforce";
import { saveNodesFromPermissions } from "@connectors/lib/remote_databases/utils";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({
  connector: "salesforce",
});

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
    const launchResult = await launchSalesforceSyncWorkflow(connector.id);
    if (launchResult.isErr()) {
      await connector.delete();
      throw launchResult.error;
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
    await stopSalesforceSyncWorkflow(connector.id);
    await connector.update({ connectionId });
    // We reset all the remote tables "lastUpsertedAt" to null, to force the tables to be
    // upserted again (to update their remoteDatabaseSecret).
    await RemoteTableModel.update(
      {
        lastUpsertedAt: null,
      },
      { where: { connectorId: connector.id } }
    );
    // We launch the workflow again so it syncs immediately.
    await launchSalesforceSyncWorkflow(connector.id);

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

    await RemoteTableModel.destroy({
      where: {
        connectorId: connector.id,
      },
    });

    await RemoteSchemaModel.destroy({
      where: {
        connectorId: connector.id,
      },
    });

    await RemoteDatabaseModel.destroy({
      where: {
        connectorId: connector.id,
      },
    });

    const res = await connector.delete();
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    const stopRes = await stopSalesforceSyncWorkflow(this.connectorId);
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
        "Salesforce connector not found."
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
          "Error launching salesforce sync workflow."
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
        "Error launching salesforce sync workflow."
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
  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
  }): Promise<
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

    // TODO(salesforce): There is a big comment for the same code in snowflake.
    if (filterPermission === "read" && parentInternalId === null) {
      const fetchRes = await fetchReadNodes({
        connectorId: connector.id,
      });
      if (fetchRes.isErr()) {
        throw fetchRes.error;
      }
      return fetchRes;
    }

    // We display the nodes that we were given access to by the admin.
    // We display the db/schemas if we have access to at least one table within those.
    if (filterPermission === "read") {
      const fetchRes = await fetchSyncedChildren({
        connectorId: connector.id,
        parentInternalId: parentInternalId,
      });
      if (fetchRes.isErr()) {
        throw fetchRes.error;
      }
      return fetchRes;
    }

    // We display all available nodes with our credentials.
    const fetchRes = await fetchAvailableChildrenInSalesforce({
      connectorId: connector.id,
      credentials,
      parentInternalId: parentInternalId,
    });
    if (fetchRes.isErr()) {
      throw fetchRes.error;
    }
    return fetchRes;
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    // Get connector and credentials just to check that the connector exists
    // and that the credentials are valid.
    const getConnectorAndCredentialsRes = await getConnectorAndCredentials(
      this.connectorId
    );
    if (getConnectorAndCredentialsRes.isErr()) {
      return new Err(getConnectorAndCredentialsRes.error);
    }

    await saveNodesFromPermissions({
      connectorId: this.connectorId,
      permissions,
    });

    const launchRes = await launchSalesforceSyncWorkflow(this.connectorId);
    if (launchRes.isErr()) {
      return launchRes;
    }

    return new Ok(undefined);
  }

  async pause(): Promise<Result<undefined, Error>> {
    throw new Error("Method pause not implemented.");
  }

  async unpause(): Promise<Result<undefined, Error>> {
    throw new Error("Method unpause not implemented.");
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
