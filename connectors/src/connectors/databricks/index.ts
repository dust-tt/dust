import type { ConnectorProvider, Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";

import type { TestConnectionError } from "@connectors/connectors/databricks/lib/databricks_api";
import { testConnection } from "@connectors/connectors/databricks/lib/databricks_api";
import { fetchAvailableChildrenInDatabricks } from "@connectors/connectors/databricks/lib/permissions";
import {
  fetchSelectedNodes,
  fetchSyncedChildren,
} from "@connectors/connectors/databricks/lib/permissions";
import {
  launchDatabricksSyncWorkflow,
  stopDatabricksSyncWorkflow,
} from "@connectors/connectors/databricks/temporal/client";
import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { DatabricksConfigurationModel } from "@connectors/lib/models/databricks";
import { RemoteTableModel } from "@connectors/lib/models/remote_databases";
import {
  getConnectorAndCredentials,
  getCredentials,
  saveNodesFromPermissions,
} from "@connectors/lib/remote_databases/utils";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorPermission, ContentNode } from "@connectors/types";
import type {
  DatabricksCredentials,
  DataSourceConfig,
} from "@connectors/types";
import { isDatabricksCredentials } from "@connectors/types";

const logger = mainLogger.child({
  connector: "databricks",
});

function handleTestConnectionError(
  error: TestConnectionError
): "INVALID_CONFIGURATION" {
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return "INVALID_CONFIGURATION";
    case "UNKNOWN":
      throw error;
    default:
      assertNever(error.code);
  }
}

export class DatabricksConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "databricks";

  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const credentialsRes = await getCredentials({
      credentialsId: connectionId,
      isTypeGuard: isDatabricksCredentials,
      logger,
    });
    if (credentialsRes.isErr()) {
      throw credentialsRes.error;
    }

    const credentials = credentialsRes.value.credentials;

    const connectionRes = await testConnection({ credentials });
    if (connectionRes.isErr()) {
      const err = connectionRes.error;
      return new Err(
        new ConnectorManagerError(handleTestConnectionError(err), err.message)
      );
    }

    const connector = await ConnectorResource.makeNew(
      "databricks",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {}
    );

    const launchRes = await launchDatabricksSyncWorkflow(connector.id);
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
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    if (!connectionId) {
      return new Ok(connector.id.toString());
    }

    const newCredentialsRes = await getCredentials({
      credentialsId: connectionId,
      isTypeGuard: isDatabricksCredentials,
      logger,
    });
    if (newCredentialsRes.isErr()) {
      throw newCredentialsRes.error;
    }
    const newCredentials = newCredentialsRes.value.credentials;

    const connectionRes = await testConnection({ credentials: newCredentials });
    if (connectionRes.isErr()) {
      const err = connectionRes.error;
      return new Err(
        new ConnectorManagerError(handleTestConnectionError(err), err.message)
      );
    }

    await stopDatabricksSyncWorkflow(connector.id);
    await connector.update({ connectionId });
    await RemoteTableModel.update(
      { lastUpsertedAt: null },
      { where: { connectorId: connector.id } }
    );

    await launchDatabricksSyncWorkflow(connector.id);

    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(new Error("Connector not found"));
    }

    await DatabricksConfigurationModel.destroy({
      where: { connectorId: connector.id },
    });

    const res = await connector.delete();
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    const stopRes = await stopDatabricksSyncWorkflow(this.connectorId);
    if (stopRes.isErr()) {
      return stopRes;
    }
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }

    const launchRes = await launchDatabricksSyncWorkflow(connector.id);
    if (launchRes.isErr()) {
      return launchRes;
    }

    return new Ok(undefined);
  }

  async sync(): Promise<Result<string, Error>> {
    throw new Error("Method sync not implemented.");
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    const connectorAndCredentialsRes =
      await getConnectorAndCredentials<DatabricksCredentials>({
        connectorId: this.connectorId,
        isTypeGuard: isDatabricksCredentials,
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
              "Databricks authorization error, please re-authorize."
            )
          );
        default:
          assertNever(connectorAndCredentialsRes.error.code);
      }
    }

    const { connector, credentials } = connectorAndCredentialsRes.value;

    if (filterPermission === "read" && parentInternalId === null) {
      const selectedRes = await fetchSelectedNodes({
        connectorId: connector.id,
      });
      if (selectedRes.isErr()) {
        throw selectedRes.error;
      }
      return selectedRes;
    }

    if (filterPermission === "read") {
      const syncedRes = await fetchSyncedChildren({
        connectorId: connector.id,
        parentInternalId,
      });
      if (syncedRes.isErr()) {
        throw syncedRes.error;
      }
      return syncedRes;
    }

    const availableRes = await fetchAvailableChildrenInDatabricks({
      connectorId: connector.id,
      credentials,
      parentInternalId,
    });
    if (availableRes.isErr()) {
      throw availableRes.error;
    }
    return availableRes;
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const connectorAndCredentialsRes = await getConnectorAndCredentials({
      connectorId: this.connectorId,
      isTypeGuard: isDatabricksCredentials,
      logger,
    });

    if (connectorAndCredentialsRes.isErr()) {
      switch (connectorAndCredentialsRes.error.code) {
        case "connector_not_found":
          throw new Error("Databricks connector not found");
        case "invalid_credentials":
          return new Err(
            new ConnectorManagerError(
              "EXTERNAL_OAUTH_TOKEN_ERROR",
              "Databricks authorization error, please re-authorize."
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

    const launchRes = await launchDatabricksSyncWorkflow(this.connectorId);
    if (launchRes.isErr()) {
      return launchRes;
    }

    return new Ok(undefined);
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    return new Ok([internalId]);
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
