import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { getSalesforceCredentials } from "@connectors/connectors/salesforce/lib/oauth";
import {
  fetchAvailableChildrenInSalesforce,
  fetchReadNodes,
  fetchSyncedChildren,
  getBatchContentNodes,
  getContentNodeParents,
} from "@connectors/connectors/salesforce/lib/permissions";
import {
  getSalesforceConnection,
  testSalesforceConnection,
} from "@connectors/connectors/salesforce/lib/salesforce_api";
import { RemoteTableModel } from "@connectors/lib/models/remote_databases";
import { SalesforceConfigurationModel } from "@connectors/lib/models/salesforce";
import {
  getConnector,
  saveNodesFromPermissions,
} from "@connectors/lib/remote_databases/utils";
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

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    // Get connector.
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    // If no connection ID is provided, we return the current connector ID.
    if (!connectionId) {
      return new Ok(c.id.toString());
    }

    // Get credentials.
    const credentialsRes = await getSalesforceCredentials(connectionId);
    if (credentialsRes.isErr()) {
      throw credentialsRes.error;
    }

    // Test connection.
    const connectionRes = await testSalesforceConnection(credentialsRes.value);
    if (connectionRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          "INVALID_CONFIGURATION",
          connectionRes.error.message
        )
      );
    }
    // await stopSalesforceSyncWorkflow(c.id);
    await c.update({ connectionId });
    // We reset all the remote tables "lastUpsertedAt" to null, to force the tables to be
    // upserted again (to update their remoteDatabaseSecret).
    await RemoteTableModel.update(
      {
        lastUpsertedAt: null,
      },
      { where: { connectorId: c.id } }
    );
    // We launch the workflow again so it syncs immediately.
    //await launchSalesforceSyncWorkflow(c.id);

    return new Ok(c.id.toString());
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
    // Get connection id.
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    // Get credentials.
    const credentialsRes = await getSalesforceCredentials(c.connectionId);
    if (credentialsRes.isErr()) {
      throw credentialsRes.error;
    }
    const credentials = credentialsRes.value;

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
        connectorId: c.id,
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
        connectorId: c.id,
        parentInternalId: parentInternalId,
      });
      if (fetchRes.isErr()) {
        throw fetchRes.error;
      }
      return fetchRes;
    }

    // We display all available nodes with our credentials.
    const fetchRes = await fetchAvailableChildrenInSalesforce({
      connectorId: c.id,
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
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const connectionId = c.connectionId;

    const credentialsRes = await getSalesforceCredentials(connectionId);
    if (credentialsRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          "EXTERNAL_OAUTH_TOKEN_ERROR",
          "Salesforce authorization error, please re-authorize."
        )
      );
    }
    await saveNodesFromPermissions({
      connectorId: this.connectorId,
      permissions,
    });

    // TODO(salesforce): implement this
    // const launchRes = await launchSalesforceSyncWorkflow(this.connectorId);
    // if (launchRes.isErr()) {
    //   return launchRes;
    // }

    return new Ok(undefined);
  }

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const connectorRes = await getConnector({
      connectorId: this.connectorId,
      logger,
    });
    if (connectorRes.isErr()) {
      return connectorRes;
    }
    const connector = connectorRes.value.connector;

    const nodesRes = await getBatchContentNodes({
      connectorId: connector.id,
      internalIds,
    });
    if (nodesRes.isErr()) {
      return nodesRes;
    }
    return new Ok(nodesRes.value);
  }

  /**
   * Retrieves the parent IDs of a content node in hierarchical order.
   * The first ID is the internal ID of the content node itself.
   */
  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    const parentsRes = getContentNodeParents({ internalId });
    if (parentsRes.isErr()) {
      return parentsRes;
    }
    return new Ok(parentsRes.value);
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
