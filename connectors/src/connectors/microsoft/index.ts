import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ModelId,
  NangoConnectionId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Client } from "@microsoft/microsoft-graph-client";

import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { microsoftConfig } from "@connectors/connectors/microsoft/lib/config";
import {
  getChannelAsContentNode,
  getDriveAsContentNode,
  getFolderAsContentNode,
  getSiteAsContentNode,
  getSitesRootAsContentNode,
  getTeamAsContentNode,
  getTeamsRootAsContentNode,
} from "@connectors/connectors/microsoft/lib/content_nodes";
import {
  getChannels,
  getDrives,
  getFolders,
  getSites,
  getTeams,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { launchMicrosoftFullSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import type { MicrosoftResourceType } from "@connectors/lib/models/microsoft";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import { syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import {
  MicrosoftConfigurationResource,
  MicrosoftConfigurationRootResource,
} from "@connectors/resources/connector/microsoft";
// import { MicrosoftConfigurationResource } from "@connectors/resources/connector/microsoft";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

async function getClient(connectionId: NangoConnectionId) {
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

export async function createMicrosoftConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
) {
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

export async function updateMicrosoftConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: string | null;
  }
): Promise<Result<string, ConnectorsAPIError>> {
  console.log("updateMicrosoftConnector", connectorId, connectionId);
  throw Error("Not implemented");
}

export async function stopMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("stopMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function deleteMicrosoftConnector(
  connectorId: ModelId,
  force = false
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(
      new Error(`Could not find connector with id ${connectorId}`)
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
      { connectorId, error: res.error },
      "Error cleaning up Microsoft connector."
    );
    return res;
  }

  return new Ok(undefined);
}

export async function pauseMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("pauseMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function unpauseMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("unpauseMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function resumeMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("resumeMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function fullResyncMicrosoftConnector(
  connectorId: ModelId,
  fromTs: number | null
) {
  console.log("fullResyncMicrosoftConnector", connectorId, fromTs);
  return launchMicrosoftFullSyncWorkflow(connectorId);
}

export async function cleanupMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("cleanupMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function retrieveMicrosoftConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
  viewType,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ContentNode[], Error>
> {
  console.log(
    "retrieveMicrosoftConnectorPermissions",
    connectorId,
    parentInternalId,
    viewType
  );

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(
      new Error(`Could not find connector with id ${connectorId}`)
    );
  }

  const client = await getClient(connector.connectionId);
  const nodes = [];

  const selectedResources = (
    await MicrosoftConfigurationRootResource.listRootsByConnectorId(
      connector.id
    )
  ).map((r) => r.resourceType + "/" + r.resourceId);

  if (!parentInternalId) {
    nodes.push(getSitesRootAsContentNode());
    nodes.push(getTeamsRootAsContentNode());
  } else {
    const [resourceType, ...rest] = parentInternalId.split("/");

    switch (resourceType) {
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
          ...(await getChannels(client, rest[0] as string)).map((n) =>
            getChannelAsContentNode(n, parentInternalId)
          )
        );
        break;
      case "site":
        nodes.push(
          ...(await getDrives(client, rest[0] as string)).map((n) =>
            getDriveAsContentNode(n, parentInternalId)
          )
        );
        break;
      case "drive":
        nodes.push(
          ...(await getFolders(client, rest[0] as string)).map((n) =>
            getFolderAsContentNode(n, rest[0] as string, parentInternalId)
          )
        );
        break;
      case "folder":
        nodes.push(
          ...(
            await getFolders(client, rest[0] as string, rest[1] as string)
          ).map((n) =>
            getFolderAsContentNode(n, rest[1] as string, parentInternalId)
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

export async function setMicrosoftConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  console.log("setMicrosoftConnectorPermissions", connectorId, permissions);

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(
      new Error(`Could not find connector with id ${connectorId}`)
    );
  }

  await MicrosoftConfigurationRootResource.batchMakeNew(
    Object.entries(permissions)
      .filter(([, permission]) => permission === "read")
      .map(([resourceId]) => {
        const [resourceType, ...rest] = resourceId.split("/");
        return {
          connectorId: connector.id,
          resourceId: rest.join("/"),
          resourceType: resourceType as MicrosoftResourceType,
        };
      })
  );

  await MicrosoftConfigurationRootResource.batchDelete(
    Object.entries(permissions)
      .filter(([, permission]) => permission === "none")
      .map(([resourceId]) => {
        const [, ...rest] = resourceId.split("/");
        return rest.join("/");
      })
  );

  return new Ok(undefined);
}

export async function getMicrosoftConfig(
  connectorId: ModelId,
  configKey: string
): Promise<Result<string | null, Error>> {
  console.log("getMicrosoftConfig", connectorId, configKey);
  throw Error("Not implemented");
}

export async function setMicrosoftConfig(
  connectorId: ModelId,
  configKey: string,
  configValue: string
): Promise<Result<void, Error>> {
  console.log("setMicrosoftConfig", connectorId, configKey, configValue);
  throw Error("Not implemented");
}

export async function retrieveMicrosoftContentNodeParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  console.log(
    "retrieveMicrosoftContentNodeParents",
    connectorId,
    internalId,
    memoizationKey
  );
  throw Error("Not implemented");
}
export function retrieveMicrosoftContentNodes(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<ContentNode[], Error>> {
  console.log("retrieveMicrosoftContentNodes", connectorId, internalIds);
  throw Error("Not implemented");
}
