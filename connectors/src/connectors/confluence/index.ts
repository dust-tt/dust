import type {
  ConnectorPermission,
  ConnectorResource,
  ConnectorsAPIError,
  ModelId,
} from "@dust-tt/types";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import {
  getConfluenceCloudInformation,
  getConfluenceUserAccountId,
  listConfluenceSpaces,
} from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import {
  getIdFromConfluenceInternalId,
  isConfluenceInternalPageId,
  makeConfluenceInternalPageId,
  makeConfluenceInternalSpaceId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import {
  retrieveAvailableSpaces,
  retrieveHierarchyForParent,
} from "@connectors/connectors/confluence/lib/permissions";
import {
  launchConfluencePersonalDataReportingSchedule,
  launchConfluenceRemoveSpacesSyncWorkflow,
  launchConfluenceSyncWorkflow,
  stopConfluenceSyncWorkflow,
} from "@connectors/connectors/confluence/temporal/client";
import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import {
  nango_client,
  nangoDeleteConnection,
} from "@connectors/lib/nango_client";
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

  const userAccountId = await getConfluenceUserAccountId(confluenceAccessToken);

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
          userAccountId,
        },
        { transaction }
      );

      return connector;
    });

    const workflowStarted = await launchConfluenceSyncWorkflow(connector.id);
    if (workflowStarted.isErr()) {
      return new Err(workflowStarted.error);
    }

    await launchConfluencePersonalDataReportingSchedule();

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
): Promise<Result<string, ConnectorsAPIError>> {
  const connector = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!connector) {
    logger.error({ connectorId }, "Connector not found.");
    return new Err({
      message: "Connector not found",
      type: "connector_not_found",
    });
  }

  if (connectionId) {
    const { connectionId: oldConnectionId } = connector;

    const currentCloudInformation = await ConfluenceConfiguration.findOne({
      attributes: ["cloudId"],
      where: {
        connectorId,
      },
    });

    const newConnection = await nango_client().getConnection(
      getRequiredNangoConfluenceConnectorId(),
      connectionId,
      false
    );

    const confluenceAccessToken = newConnection?.credentials?.access_token;
    const newConfluenceCloudInformation = await getConfluenceCloudInformation(
      confluenceAccessToken
    );

    // Change connection only if "cloudId" matches.
    if (
      newConfluenceCloudInformation &&
      currentCloudInformation &&
      newConfluenceCloudInformation.id === currentCloudInformation.cloudId
    ) {
      await connector.update({ connectionId });

      await nangoDeleteConnection(
        oldConnectionId,
        getRequiredNangoConfluenceConnectorId()
      );
    } else {
      // If the new connection does not grant us access to the same cloud id
      // delete the Nango Connection.
      await nangoDeleteConnection(
        connectionId,
        getRequiredNangoConfluenceConnectorId()
      );

      return new Err({
        type: "connector_oauth_target_mismatch",
        message: "Cannot change the workspace of a Notion connector",
      });
    }
  }

  return new Ok(connector.id.toString());
}

export async function stopConfluenceConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  // TODO(2024-01-23 flav) Change the prototype to take a ModelId.
  const connectorIdAsNumber = parseInt(connectorId, 10);
  const res = await stopConfluenceSyncWorkflow(connectorIdAsNumber);
  if (res.isErr()) {
    return res;
  }

  return new Ok(connectorId.toString());
}

export async function resumeConfluenceConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  try {
    const connector = await Connector.findOne({
      where: {
        id: connectorId,
      },
    });

    if (!connector) {
      return new Err(
        new Error(`Confluence connector not found (connectorId: ${connectorId}`)
      );
    }

    const connectorState = await ConfluenceConfiguration.findOne({
      where: {
        connectorId: connector.id,
      },
    });
    if (!connectorState) {
      return new Err(new Error("Confluence configuration not found"));
    }

    await launchConfluenceSyncWorkflow(connector.id);

    return new Ok(connector.id.toString());
  } catch (err) {
    return new Err(err as Error);
  }
}

export async function cleanupConfluenceConnector(
  connectorId: string
): Promise<Result<void, Error>> {
  const connector = await Connector.findOne({
    where: { type: "confluence", id: connectorId },
  });
  if (!connector) {
    logger.error({ connectorId }, "Confluence connector not found.");
    return new Err(new Error("Connector not found"));
  }

  return sequelize_conn.transaction(async (transaction) => {
    await Promise.all([
      ConfluenceConfiguration.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      ConfluenceSpace.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      ConfluencePage.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
    ]);

    const nangoRes = await nangoDeleteConnection(
      connector.connectionId,
      getRequiredNangoConfluenceConnectorId()
    );
    if (nangoRes.isErr()) {
      throw nangoRes.error;
    }

    await connector.destroy({
      transaction,
    });

    return new Ok(undefined);
  });
}

export async function retrieveConfluenceConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
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

  // When the filter permission is set to 'read', the full hierarchy of spaces
  // and pages that Dust can access is displayed to the user.
  if (filterPermission === "read") {
    const data = await retrieveHierarchyForParent(
      connector,
      confluenceConfig,
      parentInternalId
    );

    if (data.isErr()) {
      return new Err(data.error);
    }

    return new Ok(data.value);
  } else {
    // If the permission is not set to 'read', users are limited to selecting only
    // spaces for synchronization with Dust.
    const allSpaces = await retrieveAvailableSpaces(
      connector,
      confluenceConfig
    );

    return new Ok(allSpaces);
  }
}

async function startWorkflowIfNecessary(
  spaceIds: string[],
  workflowLauncher: (
    connectorId: ModelId,
    spaceIds: string[]
  ) => Promise<Result<string, Error>>,
  connectorId: ModelId
): Promise<Result<void, Error>> {
  if (spaceIds.length > 0) {
    const workflowStarted = await workflowLauncher(connectorId, spaceIds);
    if (workflowStarted.isErr()) {
      return new Err(workflowStarted.error);
    }
  }
  return new Ok(undefined);
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

  const addedSpaceIds = [];
  const removedSpaceIds = [];
  for (const [internalId, permission] of Object.entries(permissions)) {
    const confluenceId = getIdFromConfluenceInternalId(internalId);
    if (permission === "none") {
      await ConfluenceSpace.destroy({
        where: {
          connectorId,
          spaceId: confluenceId,
        },
      });

      removedSpaceIds.push(confluenceId);
    } else if (permission === "read") {
      const confluenceSpace = spaces.find((s) => s.id === confluenceId);

      await ConfluenceSpace.upsert({
        connectorId: connectorId,
        name: confluenceSpace?.name ?? confluenceId,
        spaceId: confluenceId,
        urlSuffix: confluenceSpace?._links.webui,
      });

      addedSpaceIds.push(confluenceId);
    } else {
      return new Err(
        new Error(
          `Invalid permission ${permission} for resource ${confluenceId}`
        )
      );
    }
  }

  const addedSpacesResult = await startWorkflowIfNecessary(
    addedSpaceIds,
    launchConfluenceSyncWorkflow,
    connectorId
  );
  if (addedSpacesResult.isErr()) {
    return new Err(addedSpacesResult.error);
  }

  const removedSpacesResult = await startWorkflowIfNecessary(
    removedSpaceIds,
    launchConfluenceRemoveSpacesSyncWorkflow,
    connectorId
  );
  if (removedSpacesResult.isErr()) {
    return new Err(removedSpacesResult.error);
  }

  return new Ok(undefined);
}

export async function retrieveConfluenceObjectsTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string>, Error>> {
  const confluenceSpaceIds = internalIds.map((id) =>
    getIdFromConfluenceInternalId(id)
  );

  const confluenceSpaces = await ConfluenceSpace.findAll({
    attributes: ["id", "spaceId", "name"],
    where: {
      connectorId: connectorId,
      spaceId: confluenceSpaceIds,
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

export async function retrieveConfluenceResourceParents(
  connectorId: ModelId,
  internalId: string
): Promise<Result<string[], Error>> {
  const confluenceId = getIdFromConfluenceInternalId(internalId);

  if (isConfluenceInternalPageId(internalId)) {
    const currentPage = await ConfluencePage.findOne({
      attributes: ["pageId", "parentId", "spaceId"],
      where: {
        connectorId,
        pageId: confluenceId,
      },
    });

    if (!currentPage) {
      return new Err(new Error("Confluence page not found."));
    }

    // If the page does not have a parentId, return only the spaceId.
    if (!currentPage.parentId) {
      return new Ok([makeConfluenceInternalSpaceId(currentPage.spaceId)]);
    }

    // Currently opting for a best-effort strategy to reduce database queries,
    // this logic may be enhanced later for important Confluence connections.
    // By fetching all pages within a space, we reconstruct parent-child
    // relationships in-app, minimizing database interactions.
    // If needed we could move the same approach as Notion and cache the results in Redis.
    const allPages = await ConfluencePage.findAll({
      attributes: ["pageId", "parentId"],
      where: {
        connectorId,
        spaceId: currentPage.spaceId,
      },
    });

    // Map each pageId to its respective parentId.
    const pageIdToParentIdMap = new Map(
      allPages.map((page) => [page.pageId, page.parentId])
    );

    const parentIds = [];
    let currentId = currentPage.pageId;

    // Traverse the hierarchy upwards until no further parent IDs are found.
    while (pageIdToParentIdMap.has(currentId)) {
      const parentId = pageIdToParentIdMap.get(currentId);
      if (parentId) {
        parentIds.push(parentId);
        // Move up the hierarchy.
        currentId = parentId;
      } else {
        // No more parents, exit the loop.
        break;
      }
    }

    return new Ok([
      // Add the space id at the beginning.
      makeConfluenceInternalSpaceId(currentPage.spaceId),
      ...parentIds.map((p) => makeConfluenceInternalPageId(p)),
    ]);
  }

  return new Ok([]);
}
