import {
  ConnectorPermission,
  ConnectorResource,
  ModelId,
} from "@dust-tt/types";
import { ConnectorsAPIErrorResponse } from "@dust-tt/types";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import {
  getConfluenceCloudInformation,
  listConfluenceSpaces,
} from "@connectors/connectors/confluence/lib/confluence_api";
import { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  ConfluenceConfigurations,
  ConfluenceSpaces,
} from "@connectors/lib/models/confluence";
import {
  getAccessTokenFromNango,
  getConnectionFromNango,
} from "@connectors/lib/nango_helpers";
import { Err, Ok, Result } from "@connectors/lib/result";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { NangoConnectionId } from "@connectors/types/nango_connection_id";

const { getRequiredNangoConfluenceConnectorId } = confluenceConfig;

const logger = mainLogger.child({
  connector: "confluence",
});

export async function createConfluenceConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const nangoConnectionId = connectionId;
  const confluenceAccessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: getRequiredNangoConfluenceConnectorId(),
    useCache: false,
  });

  const confluenceCloudInformation = await getConfluenceCloudInformation(
    confluenceAccessToken
  );
  if (!confluenceCloudInformation) {
    return new Err(new Error("Confluence access token is invalid"));
  }

  const { id: cloudId, url: cloudUrl } = confluenceCloudInformation;
  try {
    const connector = await sequelize_conn.transaction(async (transaction) => {
      const connector = await Connector.create(
        {
          type: "confluence",
          connectionId: nangoConnectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction }
      );
      await ConfluenceConfigurations.create(
        {
          cloudId,
          connectorId: connector.id,
          url: cloudUrl,
        },
        { transaction }
      );

      return connector;
    });

    // TODO(2024-01-10 flav) Uncomment in next PR.
    // await launchConfluenceFullSyncWorkflow(connector.id, null);

    return new Ok(connector.id.toString());
  } catch (e) {
    logger.error({ error: e }, "Error creating confluence connector.");
    return new Err(e as Error);
  }
}

export async function updateConfluenceConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: NangoConnectionId | null;
  }
): Promise<Result<string, ConnectorsAPIErrorResponse>> {
  console.log({ connectorId, connectionId });
  throw new Error("Not implemented");
}

export async function retrieveConfluenceConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
  if (parentInternalId) {
    return new Err(
      new Error(
        "Confluence connector does not support permission retrieval with `parentInternalId`"
      )
    );
  }

  const connector = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }

  const confluenceConfig = await ConfluenceConfigurations.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!confluenceConfig) {
    logger.error({ connectorId }, "Confluence configuration not found");
    return new Err(new Error("Confluence configuration not found"));
  }

  const confluenceConnection = await getConnectionFromNango({
    connectionId: connector.connectionId,
    integrationId: getRequiredNangoConfluenceConnectorId(),
    useCache: false,
  });

  const { access_token: confluenceAccessToken } =
    confluenceConnection.credentials;

  const spaces = await listConfluenceSpaces(
    confluenceAccessToken,
    confluenceConfig.cloudId
  );

  const syncedSpaces = await ConfluenceSpaces.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  const allSpaces: ConnectorResource[] = spaces.map((s) => {
    const isSynced = syncedSpaces.some((ss) => ss.spaceId === s.id);

    return {
      provider: "confluence",
      internalId: s.id,
      parentInternalId: null,
      type: "folder",
      title: `${s.name}`,
      sourceUrl: `${confluenceConfig.url}/wiki${s._links.webui}`,
      expandable: false,
      permission: isSynced ? "read" : "none",
      dustDocumentId: null,
      lastUpdatedAt: null,
    };
  });

  // List synced spaces.
  if (filterPermission === "read") {
    return new Ok(allSpaces.filter((s) => s.permission === "read"));
  }

  return new Ok(allSpaces);
}

export async function setConfluenceConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  // TODO(2024-01-10 flav) Uncomment in next PR.
  // let shouldFullSync = false;
  for (const [id, permission] of Object.entries(permissions)) {
    // shouldFullSync = true;
    if (permission === "none") {
      await ConfluenceSpaces.destroy({
        where: {
          connectorId,
          spaceId: id,
        },
      });
      // TODO(2024-01-09 flav) start a workflow to delete all pages within a Space.
    } else if (permission === "read") {
      await ConfluenceSpaces.upsert({
        connectorId: connectorId,
        spaceId: id,
      });
    } else {
      return new Err(
        new Error(`Invalid permission ${permission} for resource ${id}`)
      );
    }
  }

  // TODO(2024-01-10 flav) Uncomment in next PR.
  // if (shouldFullSync) {
  //   await launchConfluenceFullSyncWorkflow(connectorId, null);
  // }

  return new Ok(undefined);
}
