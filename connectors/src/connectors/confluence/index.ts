import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import {
  getConfluenceCloudInformation,
  getConfluenceUserAccountId,
  listConfluenceSpaces,
} from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import { getConfluencePageParentIds } from "@connectors/connectors/confluence/lib/hierarchy";
import {
  getIdFromConfluenceInternalId,
  isConfluenceInternalPageId,
  isConfluenceInternalSpaceId,
  makeConfluenceInternalSpaceId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import {
  checkPageHasChildren,
  createContentNodeFromPage,
  createContentNodeFromSpace,
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
import { concurrentExecutor } from "@connectors/lib/async_utils";
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
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
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
    const confluenceConfigurationBlob = {
      cloudId,
      url: cloudUrl,
      userAccountId,
    };

    const connector = await ConnectorResource.makeNew(
      "confluence",
      {
        connectionId: nangoConnectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      confluenceConfigurationBlob
    );

    const workflowStarted = await launchConfluenceSyncWorkflow(
      connector.id,
      null
    );
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
  const connector = await ConnectorResource.fetchById(connectorId);
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
      logger.info(
        {
          connectorId,
          newCloudId: newConfluenceCloudInformation?.id,
          previousCloudId: currentCloudInformation?.cloudId,
        },
        "Cannot change the workspace of a Confluence connector"
      );

      // If the new connection does not grant us access to the same cloud id
      // delete the Nango Connection.
      await nangoDeleteConnection(
        connectionId,
        getRequiredNangoConfluenceConnectorId()
      );

      return new Err({
        type: "connector_oauth_target_mismatch",
        message: "Cannot change the workspace of a Confluence connector",
      });
    }
  }

  return new Ok(connector.id.toString());
}

export async function stopConfluenceConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const res = await stopConfluenceSyncWorkflow(connectorId);
  if (res.isErr()) {
    return res;
  }

  return new Ok(undefined);
}

export async function resumeConfluenceConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  try {
    const connector = await ConnectorResource.fetchById(connectorId);
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

    await launchConfluenceSyncWorkflow(connector.id, null);

    return new Ok(undefined);
  } catch (err) {
    return new Err(err as Error);
  }
}

export async function pauseConfluenceConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found.");
    return new Err(new Error("Connector not found"));
  }

  await connector.markAsPaused();
  const r = await stopConfluenceSyncWorkflow(connectorId);
  if (r.isErr()) {
    return r;
  }

  return new Ok(undefined);
}

export async function unpauseConfluenceConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found.");
    return new Err(new Error("Connector not found"));
  }

  await connector.markAsUnpaused();
  const r = await launchConfluenceSyncWorkflow(connectorId, null);
  if (r.isErr()) {
    return r;
  }

  return new Ok(undefined);
}

export async function cleanupConfluenceConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Confluence connector not found.");
    return new Err(new Error("Connector not found"));
  }

  const nangoRes = await nangoDeleteConnection(
    connector.connectionId,
    getRequiredNangoConfluenceConnectorId()
  );
  if (nangoRes.isErr()) {
    throw nangoRes.error;
  }

  const res = await connector.delete();
  if (res.isErr()) {
    logger.error(
      { connectorId, error: res.error },
      "Error cleaning up Confluence connector."
    );
    return res;
  }

  return new Ok(undefined);
}

export async function retrieveConfluenceConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ContentNode[], Error>
> {
  const connector = await ConnectorResource.fetchById(connectorId);
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

export async function setConfluenceConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
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

  if (addedSpaceIds.length > 0) {
    const addedSpacesResult = await launchConfluenceSyncWorkflow(
      connectorId,
      null,
      addedSpaceIds
    );
    if (addedSpacesResult.isErr()) {
      return new Err(addedSpacesResult.error);
    }
  }

  if (removedSpaceIds.length > 0) {
    const removedSpacesResult = await launchConfluenceRemoveSpacesSyncWorkflow(
      connectorId,
      removedSpaceIds
    );
    if (removedSpacesResult.isErr()) {
      return new Err(removedSpacesResult.error);
    }
  }

  return new Ok(undefined);
}

export async function retrieveConfluenceContentNodes(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<ContentNode[], Error>> {
  const connectorState = await ConfluenceConfiguration.findOne({
    where: {
      connectorId,
    },
  });
  if (!connectorState) {
    return new Err(new Error("Confluence configuration not found"));
  }

  const spaceIds: string[] = [];
  const pageIds: string[] = [];

  internalIds.forEach((internalId) => {
    if (isConfluenceInternalSpaceId(internalId)) {
      spaceIds.push(getIdFromConfluenceInternalId(internalId));
    } else if (isConfluenceInternalPageId(internalId)) {
      pageIds.push(getIdFromConfluenceInternalId(internalId));
    }
  });

  const [confluenceSpaces, confluencePages] = await Promise.all([
    ConfluenceSpace.findAll({
      where: {
        connectorId: connectorId,
        spaceId: spaceIds,
      },
    }),
    ConfluencePage.findAll({
      where: {
        connectorId: connectorId,
        pageId: pageIds,
      },
    }),
  ]);

  const spaceContentNodes: ContentNode[] = confluenceSpaces.map((space) => {
    return createContentNodeFromSpace(space, connectorState.url, "read", {
      isExpandable: true,
    });
  });

  const pageContentNodes: ContentNode[] = await concurrentExecutor(
    confluencePages,
    async (page) => {
      let parentId: string;
      let parentType: "page" | "space";

      if (page.parentId) {
        parentId = page.parentId;
        parentType = "page";
      } else {
        parentId = page.spaceId;
        parentType = "space";
      }
      const isExpandable = await checkPageHasChildren(connectorId, page.pageId);

      return createContentNodeFromPage(
        { id: parentId, type: parentType },
        connectorState.url,
        page,
        isExpandable
      );
    },
    { concurrency: 8 }
  );

  const contentNodes = spaceContentNodes.concat(pageContentNodes);
  return new Ok(contentNodes);
}

export async function retrieveConfluenceContentNodeParents(
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

    const parentIds = await getConfluencePageParentIds(
      connectorId,
      currentPage
    );
    return new Ok(parentIds);
  }

  return new Ok([]);
}
