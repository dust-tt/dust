import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  NangoConnectionId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Client } from "@microsoft/microsoft-graph-client";

import { BaseConnectorManager } from "@connectors/connectors/interface";
import { microsoftConfig } from "@connectors/connectors/microsoft/lib/config";
import {
  getChannelAsContentNode,
  getDriveAsContentNode,
  getFolderAsContentNode,
  getRootNodes,
  getSiteAsContentNode,
  getTeamAsContentNode,
} from "@connectors/connectors/microsoft/lib/content_nodes";
import {
  getChannels,
  getDrives,
  getFolders,
  getSites,
  getTeams,
  microsoftInternalIdFromNodeData,
  microsoftNodeDataFromInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { launchMicrosoftFullSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import { syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftRootResource } from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export class MicrosoftConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, Error>> {
    const client = await getClient(connectionId);

    try {
      // Sanity checks - check connectivity and permissions. User should be able to access the sites and teams list.
      await getSites(client);
      await getTeams(client);
    } catch (err) {
      logger.error(
        {
          err,
        },
        "Error creating Microsoft connector"
      );
      return new Err(new Error("Error creating Microsoft connector"));
    }

    const connector = await ConnectorResource.makeNew(
      "microsoft",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      {}
    );

    await syncSucceeded(connector.id);

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorsAPIError>> {
    console.log("updateMicrosoftConnector", this.connectorId, connectionId);
    throw Error("Not implemented");
  }

  async clean({
    force,
  }: {
    force: boolean;
  }): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    const nangoRes = await nangoDeleteConnection(
      connector.connectionId,
      microsoftConfig.getRequiredNangoMicrosoftConnectorId()
    );
    if (nangoRes.isErr()) {
      if (!force) {
        return nangoRes;
      } else {
        logger.error(
          {
            err: nangoRes.error,
          },
          "Error deleting connection from Nango"
        );
      }
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Microsoft connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    console.log("fullResyncMicrosoftConnector", this.connectorId, fromTs);
    return launchMicrosoftFullSyncWorkflow(this.connectorId, null);
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    const client = await getClient(connector.connectionId);
    const nodes = [];

    const selectedResources = (
      await MicrosoftRootResource.listRootsByConnectorId(connector.id)
    ).map((r) =>
      microsoftInternalIdFromNodeData({
        nodeType: r.nodeType,
        itemApiPath: r.itemApiPath,
      })
    );

    if (!parentInternalId) {
      nodes.push(...getRootNodes());
    } else {
      const { nodeType } = microsoftNodeDataFromInternalId(parentInternalId);

      switch (nodeType) {
        case "sites-root":
          nodes.push(
            ...(await getSites(client)).map((n) => getSiteAsContentNode(n))
          );
          break;
        case "teams-root":
          nodes.push(
            ...(await getTeams(client)).map((n) => getTeamAsContentNode(n))
          );
          break;
        case "team":
          nodes.push(
            ...(await getChannels(client, parentInternalId)).map((n) =>
              getChannelAsContentNode(n, parentInternalId)
            )
          );
          break;
        case "site":
          nodes.push(
            ...(await getDrives(client, parentInternalId)).map((n) =>
              getDriveAsContentNode(n, parentInternalId)
            )
          );
          break;
        case "drive":
        case "folder":
          nodes.push(
            ...(await getFolders(client, parentInternalId)).map((n) =>
              getFolderAsContentNode(n, parentInternalId)
            )
          );
          break;
      }
    }

    const nodesWithPermissions = nodes.map((res) => ({
      ...res,
      permission: (selectedResources.includes(res.internalId)
        ? "read"
        : "none") as ConnectorPermission,
    }));

    if (filterPermission) {
      return new Ok(
        nodesWithPermissions.filter((n) => n.permission === filterPermission)
      );
    }

    return new Ok(nodesWithPermissions);
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    await MicrosoftRootResource.batchDelete({
      resourceIds: Object.entries(permissions).map((internalId) => {
        const { itemApiPath } = microsoftNodeDataFromInternalId(internalId[0]);
        return itemApiPath;
      }),
      connectorId: connector.id,
    });

    await MicrosoftRootResource.batchMakeNew(
      Object.entries(permissions)
        .filter(([, permission]) => permission === "read")
        .map(([id]) => {
          return {
            connectorId: connector.id,
            ...microsoftNodeDataFromInternalId(id),
          };
        })
    );

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    console.log("stopMicrosoftConnector", this.connectorId);
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    console.log("resumeMicrosoftConnector", this.connectorId);
    throw Error("Not implemented");
  }

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    console.log("retrieveMicrosoftContentNodes", this.connectorId, internalIds);
    throw Error("Not implemented");
  }

  async retrieveContentNodeParents({
    internalId,
    memoizationKey,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    console.log(
      "retrieveMicrosoftContentNodeParents",
      this.connectorId,
      internalId,
      memoizationKey
    );
    throw Error("Not implemented");
  }

  async setConfigurationKey({
    configKey,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    console.log("setMicrosoftConfig", this.connectorId, configKey);
    throw Error("Not implemented");
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    console.log("getMicrosoftConfig", this.connectorId, configKey);
    throw Error("Not implemented");
  }

  async pause(): Promise<Result<undefined, Error>> {
    console.log("pauseMicrosoftConnector", this.connectorId);
    throw Error("Not implemented");
  }

  async unpause(): Promise<Result<undefined, Error>> {
    console.log("unpauseMicrosoftConnector", this.connectorId);
    throw Error("Not implemented");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    console.log("garbageCollectMicrosoftConnector", this.connectorId);
    throw Error("Not implemented");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}

export async function getClient(connectionId: NangoConnectionId) {
  const nangoConnectionId = connectionId;

  const msAccessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: microsoftConfig.getRequiredNangoMicrosoftConnectorId(),
    useCache: false,
  });

  return Client.init({
    authProvider: (done) => done(null, msAccessToken),
  });
}
