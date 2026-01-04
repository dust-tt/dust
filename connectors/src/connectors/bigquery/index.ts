import type { ConnectorProvider, Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";

import type { TestConnectionError } from "@connectors/connectors/bigquery/lib/bigquery_api";
import { testConnection } from "@connectors/connectors/bigquery/lib/bigquery_api";
import {
  fetchAvailableChildrenInBigQuery,
  fetchReadNodes,
  fetchSyncedChildren,
} from "@connectors/connectors/bigquery/lib/permissions";
import {
  launchBigQuerySyncWorkflow,
  stopBigQuerySyncWorkflow,
} from "@connectors/connectors/bigquery/temporal/client";
import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { BigQueryConfigurationModel } from "@connectors/lib/models/bigquery";
import { RemoteTableModel } from "@connectors/lib/models/remote_databases";
import {
  getConnectorAndCredentials,
  getCredentials,
  saveNodesFromPermissions,
} from "@connectors/lib/remote_databases/utils";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorPermission, ContentNode } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { isBigQueryWithLocationCredentials } from "@connectors/types";

const logger = mainLogger.child({
  connector: "bigquery",
});

function handleTestConnectionError(
  e: TestConnectionError
): "INVALID_CONFIGURATION" {
  switch (e.code) {
    case "INVALID_CREDENTIALS":
      return "INVALID_CONFIGURATION";
    case "UNKNOWN":
      throw e;
    default:
      assertNever(e.code);
  }
}

export class BigQueryConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "bigquery";

  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const credentialsRes = await getCredentials({
      credentialsId: connectionId,
      isTypeGuard: isBigQueryWithLocationCredentials,
      logger,
    });
    if (credentialsRes.isErr()) {
      throw credentialsRes.error;
    }
    const credentials = credentialsRes.value.credentials;

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
    const configBlob = {
      useMetadataForDBML: false,
    };
    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      configBlob
    );

    const launchRes = await launchBigQuerySyncWorkflow(connector.id);
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
      isTypeGuard: isBigQueryWithLocationCredentials,
      logger,
    });
    if (newCredentialsRes.isErr()) {
      throw newCredentialsRes.error;
    }

    const newCredentials = newCredentialsRes.value.credentials;

    const connectionRes = await testConnection({ credentials: newCredentials });
    if (connectionRes.isErr()) {
      return new Err(
        new ConnectorManagerError(
          handleTestConnectionError(connectionRes.error),
          connectionRes.error.message
        )
      );
    }
    await stopBigQuerySyncWorkflow({
      connectorId: c.id,
      stopReason: "Stopped to update connector configuration",
    });
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
    await launchBigQuerySyncWorkflow(c.id);

    return new Ok(c.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(new Error("Connector not found"));
    }

    await BigQueryConfigurationModel.destroy({
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
    const stopRes = await stopBigQuerySyncWorkflow({
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
      const launchRes = await launchBigQuerySyncWorkflow(connector.id);
      if (launchRes.isErr()) {
        logger.error(
          {
            workspaceId: dataSourceConfig.workspaceId,
            dataSourceId: dataSourceConfig.dataSourceId,
            error: launchRes.error,
          },
          "Error launching bigquery sync workflow."
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
        "Error launching bigquery sync workflow."
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
   * For BigQuery the tree is: projects > datasets > tables
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
    const connectorAndCredentialsRes = await getConnectorAndCredentials({
      connectorId: this.connectorId,
      isTypeGuard: isBigQueryWithLocationCredentials,
      logger,
    });
    if (connectorAndCredentialsRes.isErr()) {
      switch (connectorAndCredentialsRes.error.code) {
        case "connector_not_found":
          return new Err(
            new ConnectorManagerError(
              "CONNECTOR_NOT_FOUND",
              "Connector not found"
            )
          );
        case "invalid_credentials":
          return new Err(
            new ConnectorManagerError(
              "EXTERNAL_OAUTH_TOKEN_ERROR",
              "BigQuery authorization error, please re-authorize."
            )
          );
        default:
          assertNever(connectorAndCredentialsRes.error.code);
      }
    }

    const { connector, credentials } = connectorAndCredentialsRes.value;

    // TODO(BigQuery): There is a big comment for the same code in snowflake.
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
    // We display the db/datasets if we have access to at least one table within those.
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
    const fetchRes = await fetchAvailableChildrenInBigQuery({
      connectorId: connector.id,
      credentials: credentials,
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
    const connectorAndCredentialsRes = await getConnectorAndCredentials({
      connectorId: this.connectorId,
      isTypeGuard: isBigQueryWithLocationCredentials,
      logger,
    });
    if (connectorAndCredentialsRes.isErr()) {
      switch (connectorAndCredentialsRes.error.code) {
        case "connector_not_found":
          throw new Error("BigQuery connector not found");
        case "invalid_credentials":
          return new Err(
            new ConnectorManagerError(
              "EXTERNAL_OAUTH_TOKEN_ERROR",
              "BigQuery authorization error, please re-authorize."
            )
          );
        default:
          assertNever(connectorAndCredentialsRes.error.code);
      }
    }

    await saveNodesFromPermissions({
      connectorId: this.connectorId,
      permissions,
    });

    const launchRes = await launchBigQuerySyncWorkflow(this.connectorId);
    if (launchRes.isErr()) {
      return launchRes;
    }

    return new Ok(undefined);
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
    return new Ok([internalId]);
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: "useMetadataForDBML";
    configValue: string;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    switch (configKey) {
      case "useMetadataForDBML": {
        const connectorConfig = await BigQueryConfigurationModel.findOne({
          where: {
            connectorId: connector.id,
          },
        });
        if (!connectorConfig) {
          return new Err(
            new Error(
              `Connector configuration not found (connectorId: ${connector.id})`
            )
          );
        }

        await connectorConfig.update({
          useMetadataForDBML: configValue === "true",
        });

        // Clean lastUpsertedAt for all remote tables to force a full sync with the appropriate tags
        await RemoteTableModel.update(
          {
            lastUpsertedAt: null,
          },
          { where: { connectorId: connector.id } }
        );

        await launchBigQuerySyncWorkflow(connector.id);

        return new Ok(void 0);
      }
    }
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: "useMetadataForDBML";
  }): Promise<Result<string | null, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    switch (configKey) {
      case "useMetadataForDBML": {
        const connectorConfig = await BigQueryConfigurationModel.findOne({
          where: {
            connectorId: connector.id,
          },
        });
        if (!connectorConfig) {
          return new Err(
            new Error(
              `Connector configuration not found (connectorId: ${connector.id})`
            )
          );
        }

        return new Ok(connectorConfig.useMetadataForDBML.toString());
      }
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method garbageCollect not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method configure not implemented.");
  }
}
