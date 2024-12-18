import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { assertNever, Err, isSnowflakeCredentials, Ok } from "@dust-tt/types";

import type {
  CreateConnectorErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import {
  fetchAvailableChildrenInSnowflake,
  fetchReadNodes,
  fetchSyncedChildren,
  getBatchContentNodes,
  getContentNodeParents,
  saveNodesFromPermissions,
} from "@connectors/connectors/snowflake/lib/permissions";
import type { TestConnectionError } from "@connectors/connectors/snowflake/lib/snowflake_api";
import { testConnection } from "@connectors/connectors/snowflake/lib/snowflake_api";
import {
  getConnector,
  getConnectorAndCredentials,
  getCredentials,
} from "@connectors/connectors/snowflake/lib/utils";
import {
  launchSnowflakeSyncWorkflow,
  stopSnowflakeSyncWorkflow,
} from "@connectors/connectors/snowflake/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { SnowflakeConfigurationModel } from "@connectors/lib/models/snowflake";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({
  connector: "snowflake",
});

function handleTestConnectionError(
  e: TestConnectionError
): "INVALID_CONFIGURATION" {
  switch (e.code) {
    case "INVALID_CREDENTIALS":
    case "NOT_READONLY":
    case "NO_TABLES":
      return "INVALID_CONFIGURATION";
    case "UNKNOWN":
      throw e;
    default:
      assertNever(e.code);
  }
}

export class SnowflakeConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const credentialsRes = await getCredentials({
      credentialsId: connectionId,
      logger,
    });
    if (credentialsRes.isErr()) {
      throw credentialsRes.error;
    }
    const credentials = credentialsRes.value.credentials;

    if (!isSnowflakeCredentials(credentials)) {
      throw new Error(
        "Invalid credentials type - expected snowflake credentials"
      );
    }

    // Then we test the connection is successful.
    const connectionRes = await testConnection({ credentials });
    if (connectionRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          handleTestConnectionError(connectionRes.error),
          connectionRes.error.message
        )
      );
    }

    // We can create the connector.
    const snowflakeConfigBlob = {};
    const connector = await ConnectorResource.makeNew(
      "snowflake",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      snowflakeConfigBlob
    );

    const launchRes = await launchSnowflakeSyncWorkflow(connector.id);
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
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    if (!connectionId) {
      return new Ok(c.id.toString());
    }

    const newCredentialsRes = await getCredentials({
      credentialsId: connectionId,
      logger,
    });
    if (newCredentialsRes.isErr()) {
      throw newCredentialsRes.error;
    }

    const newCredentials = newCredentialsRes.value.credentials;

    if (!isSnowflakeCredentials(newCredentials)) {
      return new Err(
        new ConnectorManagerError(
          "INVALID_CONFIGURATION",
          "Invalid credentials type - expected snowflake credentials"
        )
      );
    }

    const connectionRes = await testConnection({ credentials: newCredentials });
    if (connectionRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          handleTestConnectionError(connectionRes.error),
          connectionRes.error.message
        )
      );
    }

    await c.update({ connectionId });
    await launchSnowflakeSyncWorkflow(c.id);

    return new Ok(c.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(new Error("Connector not found"));
    }

    await SnowflakeConfigurationModel.destroy({
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
    const stopRes = await stopSnowflakeSyncWorkflow(this.connectorId);
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
        "Snowflake connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    try {
      const launchRes = await launchSnowflakeSyncWorkflow(connector.id);
      if (launchRes.isErr()) {
        logger.error(
          {
            workspaceId: dataSourceConfig.workspaceId,
            dataSourceId: dataSourceConfig.dataSourceId,
            error: launchRes.error,
          },
          "Error launching snowflake sync workflow."
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
        "Error launching snowflake sync workflow."
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
   * For Snowflake the tree is: databases > schemas > tables
   */
  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
  }): Promise<Result<ContentNode[], Error>> {
    const connectorAndCredentialsRes = await getConnectorAndCredentials({
      connectorId: this.connectorId,
      logger,
    });
    if (connectorAndCredentialsRes.isErr()) {
      return connectorAndCredentialsRes;
    }
    const { connector, credentials } = connectorAndCredentialsRes.value;

    // I don't understand why but connector expects all the selected node
    // no matter if they are at the root level if we filter on read + parentInternalId === null.
    // This really sucks because for Snowflake it's easy to build the real tree.
    // It means that we get a weird behavior on the tree displayed in the UI sidebar.
    // TODO(SNOWFLAKE): Fix this, even if with a hack.
    if (filterPermission === "read" && parentInternalId === null) {
      return fetchReadNodes({
        connectorId: connector.id,
      });
    }

    // We display the nodes that we were given access to by the admin.
    // We display the db/schemas if we have access to at least one table within those.
    if (filterPermission === "read") {
      return fetchSyncedChildren({
        connectorId: connector.id,
        parentInternalId: parentInternalId,
      });
    }

    if (!isSnowflakeCredentials(credentials)) {
      throw new Error(
        "Invalid credentials type - expected snowflake credentials"
      );
    }

    // We display all available nodes with our credentials.
    return fetchAvailableChildrenInSnowflake({
      connectorId: connector.id,
      credentials: credentials,
      parentInternalId: parentInternalId,
    });
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    await saveNodesFromPermissions({
      connectorId: this.connectorId,
      permissions,
      logger,
    });

    const launchRes = await launchSnowflakeSyncWorkflow(this.connectorId);
    if (launchRes.isErr()) {
      return launchRes;
    }

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
