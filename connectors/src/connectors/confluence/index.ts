import type {
  ConnectorPermission,
  ConnectorResource,
  ModelId,
} from "@dust-tt/types";
import type { ConnectorsAPIErrorResponse } from "@dust-tt/types";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import {
  getConfluenceCloudInformation,
  listConfluenceSpaces,
} from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import { launchConfluenceFullSyncWorkflow } from "@connectors/connectors/confluence/temporal/client";
import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  ConfluenceConfiguration,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import type { Result } from "@connectors/lib/result";
import { Err, Ok } from "@connectors/lib/result";
import mainLogger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { NangoConnectionId } from "@connectors/types/nango_connection_id";

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
      await ConfluenceConfiguration.create(
        {
          cloudId,
          connectorId: connector.id,
          url: cloudUrl,
        },
        { transaction }
      );

      return connector;
    });

    const workflowStarted = await launchConfluenceFullSyncWorkflow(
      connector.id,
      null
    );
    if (workflowStarted.isErr()) {
      return new Err(workflowStarted.error);
    }

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

function createConnectorResourceFromSpace(
  space: ConfluenceSpace | ConfluenceSpaceType,
  baseUrl: string,
  permission: ConnectorPermission
): ConnectorResource {
  return {
    provider: "confluence",
    internalId: space.id.toString(),
    parentInternalId: null,
    type: "folder",
    title: space.name || "Unnamed Space",
    sourceUrl: `${baseUrl}/wiki${space.urlSuffix}`,
    expandable: false,
    permission: permission,
    dustDocumentId: null,
    lastUpdatedAt: null,
  };
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

  const confluenceConfig = await ConfluenceConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!confluenceConfig) {
    logger.error({ connectorId }, "Confluence configuration not found");
    return new Err(new Error("Confluence configuration not found"));
  }

  const syncedSpaces = await ConfluenceSpace.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  let allSpaces: ConnectorResource[] = [];
  if (filterPermission === "read") {
    allSpaces = syncedSpaces.map((space) =>
      createConnectorResourceFromSpace(
        space,
        confluenceConfig.url,
        filterPermission
      )
    );
  } else {
    const spaces = await listConfluenceSpaces(connector, confluenceConfig);

    allSpaces = spaces.map((space) => {
      const isSynced = syncedSpaces.some((ss) => ss.spaceId === space.id);

      return createConnectorResourceFromSpace(
        space,
        confluenceConfig.url,
        isSynced ? "read" : "none"
      );
    });
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

  let spaces: ConfluenceSpaceType[] = [];
  // Fetch Confluence spaces only if the intention is to add new spaces to sync.
  const shouldFetchConfluenceSpaces = Object.values(permissions).some(
    (permission) => permission === "read"
  );
  if (shouldFetchConfluenceSpaces) {
    spaces = await listConfluenceSpaces(connector);
  }

  let shouldFullSync = false;
  for (const [id, permission] of Object.entries(permissions)) {
    shouldFullSync = true;
    if (permission === "none") {
      await ConfluenceSpace.destroy({
        where: {
          connectorId,
          spaceId: id,
        },
      });
      // TODO(2024-01-09 flav) start a workflow to delete all pages within a Space.
    } else if (permission === "read") {
      const confluenceSpace = spaces.find((s) => s.id === id);

      await ConfluenceSpace.upsert({
        connectorId: connectorId,
        name: confluenceSpace?.name ?? id,
        spaceId: id,
        urlSuffix: confluenceSpace?._links.webui,
      });
    } else {
      return new Err(
        new Error(`Invalid permission ${permission} for resource ${id}`)
      );
    }
  }

  if (shouldFullSync) {
    const workflowStarted = await launchConfluenceFullSyncWorkflow(
      connectorId,
      null
    );
    if (workflowStarted.isErr()) {
      return new Err(workflowStarted.error);
    }
  }

  return new Ok(undefined);
}

export async function retrieveConfluenceObjectsTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string>, Error>> {
  const confluenceSpaces = await ConfluenceSpace.findAll({
    attributes: ["id", "spaceId", "name"],
    where: {
      connectorId: connectorId,
      spaceId: internalIds,
    },
  });

  const titles = confluenceSpaces.reduce<Record<string, string>>(
    (acc, curr) => {
      acc[curr.spaceId] = curr.name;
      return acc;
    },
    {}
  );

  return new Ok(titles);
}
